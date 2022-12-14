import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import {
  PLATFORM_NAME, PLUGIN_NAME,
} from './settings';
import { FroniousInverterPlatformOutputPinAccessory } from './fronius-output-pin-accessory';

import { FroniusInverter } from './fronius';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class FroniusInverterHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {

    if (this.config.inverterIp === undefined) {
      this.log.error('Required inverter ip in configuration to continue');
      return;
    }

    const fronius = new FroniusInverter(this.log, this.config.inverterIp, this.config.userName,
      this.config.password);

    const about = await fronius.getAboutSystem();
    this.log.info(`Connected to ${this.config.inverterIp} hardware revision ${about.txtHwVersion} running firmware v${about.txtSwVersion}`);

    for (const gpioPin of this.config.gpioPins) {

      const inverterConfig =
      {
        inverterIp: this.config.inverterIp,
        userName: this.config.userName,
        password: this.config.password,
        gpioPin: gpioPin.pin,
        displayName: gpioPin.name,
        timeoutHours: gpioPin.timeoutHours,
      };

      // generate a unique id for the accessory
      const uuid = this.api.hap.uuid.generate(about.txtLanMac + '_' + about.txtWlanMac + '_' + gpioPin.pin);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new FroniousInverterPlatformOutputPinAccessory(this, existingAccessory);

      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory: ', gpioPin.name, ' connected to ', gpioPin.pin);

        // create a new accessory
        const accessory = new this.api.platformAccessory(gpioPin.name, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = inverterConfig;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        new FroniousInverterPlatformOutputPinAccessory(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

  }
}
