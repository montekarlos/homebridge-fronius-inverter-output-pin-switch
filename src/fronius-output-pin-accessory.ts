import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { FroniusInverterHomebridgePlatform } from './fronius-platform';
import { FroniusInverter } from './fronius';

export class FroniousInverterPlatformOutputPinAccessory {

  private pinBoostService: Service;
  private pinService: Service;
  private pinOnDurationService: Service;
  private fronius: FroniusInverter;
  private timeout: NodeJS.Timeout | undefined;
  private magicUuid = '1d7756c9-9f87-4cdf-823e-5348b11692c9'; // Do not change

  /**
   * Current state of fronius inverter
   */
  private currentState = {
    BoostOn: false, // Is the pin forced on
    PinOn: false, // Is the pin on
    Faulted: true,
  };

  constructor(
    private readonly platform: FroniusInverterHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    const config = this.getDeviceContext();

    this.fronius = new FroniusInverter(this.platform.log, config.inverterIp, config.userName, config.password);
    this.checkPinStateAtInverter();

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Fronius');
    //.setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
    //.setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // get the Switch service if it exists, otherwise create a new Switch service
    // you can create multiple services for each accessory
    const boostName = 'Boost ' + config.displayName;
    this.pinBoostService = this.accessory.getService(boostName) ||
      this.accessory.addService(this.platform.Service.Switch, boostName, 'Boost');

    this.pinBoostService.setCharacteristic(this.platform.Characteristic.Name, boostName);

    this.pinBoostService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setBoostOn.bind(this))
      .onGet(this.getBoostOn.bind(this));

    this.pinService = this.accessory.getService(config.displayName) ||
      this.accessory.addService(this.platform.Service.Lightbulb, config.displayName, 'IsOn');

    this.pinService.setCharacteristic(this.platform.Characteristic.Name, config.displayName);
    this.pinService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getIsOn.bind(this));

    const onDurationServiceName = config.displayName + ' On Time';
    this.pinOnDurationService = this.accessory.getService(onDurationServiceName) ||
        this.accessory.addService(this.platform.Service.LightSensor, onDurationServiceName, 'OnTime');
    this.pinOnDurationService
      .getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
      .setProps({
        minValue: 0, // allow minimum lux to be 0, otherwise defaults to 0.0001
      })
      .onGet(this.getPinOnTime.bind(this));

    this.updateState(true);
  }

  async updateState(scheduleNext = false) {
    try {
      const pinStatus = await this.fronius.getPinStatus(this.getPin());
      const isBoostOn = await this.fronius.getPinForcedOn(this.getPin(), this.getBoostLabelPrefix());

      this.currentState.PinOn = pinStatus.state;
      this.currentState.BoostOn = isBoostOn;
      this.currentState.Faulted = false;

      if (this.currentState.PinOn) {
        this.accessory.context.device.OnTimeMinutes += 1;
      }

      const millisecondsInDay = 60 * 60 * 24 * 1000;
      // Get total milliseconds since epoch in LOCAL time
      const totalMillisecondsLocalTime = (Date.now()) - (60 * 1000 * new Date().getTimezoneOffset());
      if (totalMillisecondsLocalTime % millisecondsInDay <
            this.accessory.context.device.LastUpdate % millisecondsInDay ||
          // eslint-disable-next-line eqeqeq
          this.accessory.context.device.OnTimeMinutes == null) {
        // has wrapped around (at midnight) or never initialised
        this.accessory.context.device.OnTimeMinutes = 0;
        this.platform.log.debug('Reset pin on time minutes to zero');
      }

      this.accessory.context.device.LastUpdate = totalMillisecondsLocalTime;

      this.platform.log.debug('Boost On:', isBoostOn + ', Pin On:', pinStatus.state);
    } catch {
      this.currentState.Faulted = true;
    } finally {
      if (scheduleNext) {
      // Asynchronously update the state of the inverter
        setTimeout(async () => await this.updateState(true), 60000);
      }
    }
  }

  getDeviceContext() {
    return this.accessory.context.device;
  }

  getPin() {
    return this.getDeviceContext().gpioPin;
  }

  getBoostLabelPrefix() {
    return 'hbboost_' + this.getPin() + '_' + this.magicUuid + '_';
  }

  launchBoostTimeout() {
    if (this.getDeviceContext().timeoutHours > 0) {
      const timeoutHours = this.getDeviceContext().timeoutHours;
      this.timeout = setTimeout(async () => {
        this.platform.log.info('Boost has timedout after', timeoutHours, 'hours');
        await this.setBoostOn(false);
      }, 1000 * 60 * 60 * timeoutHours);
      this.timeout.unref();
    }
  }

  async checkPinStateAtInverter() {
    try {
      const currentConfig = await this.fronius.getPinConfig(this.getPin());
      if (currentConfig.label.startsWith(this.getBoostLabelPrefix())) {
        this.platform.log.warn(`Pin already appears to be boosted: ${JSON.stringify(currentConfig)}`);
        this.launchBoostTimeout();
      } else {
        this.getDeviceContext().normalOnWatts = currentConfig.thresholdOn;
        this.getDeviceContext().normalOffWatts = currentConfig.thresholdOff;
        this.platform.log.debug(`Saving normal on as ${currentConfig.thresholdOn} Watts`);
        this.platform.log.debug(`Saving normal off as ${currentConfig.thresholdOff} Watts`);
      }
    } catch {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async getIsOn(): Promise<CharacteristicValue> {
    if (this.currentState.Faulted) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    return this.currentState.PinOn;
  }

  async setBoostOn(value: CharacteristicValue) {
    const isOn = this.currentState.BoostOn;
    try {
      if (isOn === value) {
        this.platform.log.warn('State mismatch');
      }
      if (isOn) {
        this.platform.log.debug('Set normal config');
        await this.fronius.setPinPpvConfig(
          this.getPin(), this.getDeviceContext().normalOnWatts,
          this.getDeviceContext().normalOffWatts, this.getBoostLabelPrefix());
        if (this.timeout !== undefined) {
          clearTimeout(this.timeout);
        }
      } else {
        await this.checkPinStateAtInverter();
        this.platform.log.debug('Set boost config');
        await this.fronius.setPinForcedOn(this.getPin(), this.getBoostLabelPrefix());
        this.launchBoostTimeout();
      }
    } catch {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    } finally {
      this.updateState();
    }

  }

  async getBoostOn(): Promise<CharacteristicValue> {
    if (this.currentState.Faulted) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    return this.currentState.BoostOn;
  }

  async getPinOnTime(): Promise<CharacteristicValue> {
    if (this.currentState.Faulted) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    return this.accessory.context.device.OnTimeMinutes || 0;
  }
}
