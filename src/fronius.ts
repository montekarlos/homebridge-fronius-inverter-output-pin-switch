import axios, { AxiosError } from 'axios';
import { Logger } from 'homebridge';
import { Digest } from './digest';
import { FroniusJson, EmrsStatus, EmrsConfig, EmrsPinStatus, EmrsPinConfig, About } from './froniusApi';


export class FroniusInverter {

  private challenge = '';
  private digest: Digest = new Digest();

  constructor(
    public readonly log: Logger,
    private readonly host: string,
    private readonly userName: string,
    private readonly password: string,
  ) {
    this.debug(`Creating new fronius inverter: ${host} ${userName} ${password}`);
  }

  debug(message: string) {
    this.log.debug(message);
  }

  getUrl(uri: string) {
    return `http://${this.host}${uri}`;
  }

  updateChallenge(error: AxiosError<unknown, unknown>) {
    let updatedChallenge = false;
    if (error.response) {
      const response = error.response;
      if (response.status === 401) {
        this.challenge = response.headers['x-www-authenticate'];
        updatedChallenge = true;
      }
    }
    return updatedChallenge;
  }

  calculateAuthHeader(uri: string, method = 'GET') {
    return this.digest.DigestHeader(method, uri, this.challenge, `${this.userName}:${this.password}`);
  }

  async getInternal(uri: string) {
    let body: unknown;
    let statusCode = 0;
    const url = this.getUrl(uri);
    try {
      const response = await axios.get(url,
        {
          headers: {
            'Authorization': this.calculateAuthHeader(uri),
          },
        });
      body = response.data;
      statusCode = response.status;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        statusCode = error.response?.status ?? 0;
        if (!this.updateChallenge(error)) {
          this.log.error(`Failed with ${error.message} while trying to GET from ${url}`);
          throw error;
        }
      } else {
        this.log.error(`Failed with ${error as string} while trying to GET from ${url}`);
        throw error;
      }
    }
    return [statusCode, body];
  }

  async get(uri: string) {
    let [code, result] = await this.getInternal(uri);
    if (401 === code) {
      // getInternal wil have updated the challenge so should authenticate this time
      [code, result] = await this.getInternal(uri);
    }
    return result;
  }

  async postInternal(uri: string, jsonData: unknown) {
    const url = this.getUrl(uri);
    try {
      const axiosConfig = {
        headers: {
          'Authorization': this.calculateAuthHeader(uri, 'POST'),
          'Content-Type': 'application/json',
        },
      };
      const response = (await axios.post(url, jsonData, axiosConfig));
      const result = response.data as FroniusJson<unknown>;
      if (result.Head.Status.Code !== 0) {
        this.log.error(`Failed to to POST to ${url} with response ${JSON.stringify(result.Head, null, 4)} `);
      }
      return response.status;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (!this.updateChallenge(error)) {
          this.log.error(`Failed with ${error.message} while trying to POST to ${url}`);
          throw error;
        }
      } else {
        this.log.error(`Failed with ${error as string} while trying to POST to ${url}`);
        throw error;
      }
    }
  }

  async post(uri: string, jsonData: unknown) {
    let code = await this.postInternal(uri, jsonData);
    if (401 === code) {
      // postInternal wil have updated the challenge so should authenticate this time
      code = await this.postInternal(uri, jsonData);
    }
    return code;
  }

  async getEmrsStatus() {
    return (await this.get('/status/emrs/') as FroniusJson<EmrsStatus>).Body.Data;
  }

  async getEmrsConfig() {
    return (await this.get('/config/emrs/') as FroniusJson<EmrsConfig>).Body.Data;
  }

  async getAboutSystem() {
    return await this.get('/admincgi-bin/aboutSystem.cgi') as About;
  }

  async getPinStatus(pinNumber: string) {
    return (await this.getEmrsStatus()).emrs.gpios[pinNumber] as EmrsPinStatus;
  }

  async getPinConfig(pinNumber: string) {
    return (await this.getEmrsConfig()).emrs.rules[pinNumber] as EmrsPinConfig;
  }

  async setPinForcedOn(pinNumber: string, labelPrefix: string) {
    const request = await this.getEmrsConfig();
    const pinConfig = request.emrs.rules[pinNumber] as EmrsPinConfig;
    pinConfig.mode = 'pgrid';
    pinConfig.thresholdOn = 1;
    pinConfig.thresholdOff = -99999;
    pinConfig.label = labelPrefix + pinConfig.label;
    await this.post('/config/emrs/?method=save', request);
  }

  async setPinPpvConfig(pinNumber: string, thresholdOn: number, thresholdOff: number, labelPrefix: string) {
    const request = await this.getEmrsConfig();
    const pinConfig = request.emrs.rules[pinNumber] as EmrsPinConfig;
    pinConfig.mode = 'ppv';
    pinConfig.thresholdOn = thresholdOn;
    pinConfig.thresholdOff = thresholdOff;
    pinConfig.label = pinConfig.label.replace(labelPrefix, '');
    await this.post('/config/emrs/?method=save', request);
  }

  async getPinForcedOn(pinNumber: string, labelPrefix: string) {
    const pinConfig = await this.getPinConfig(pinNumber);
    return pinConfig.thresholdOff === -99999 &&
           pinConfig.label.startsWith(labelPrefix);
  }

  // GET http://10.0.40.6/components/Inverter/readable
}