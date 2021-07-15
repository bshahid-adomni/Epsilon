import { Logger } from '@bitblit/ratchet/dist/common';
import { SaltMineNamedProcessor } from '../salt-mine-named-processor';
import { SaltMineConfig } from '../salt-mine-config';

export class EchoProcessor implements SaltMineNamedProcessor<any, any> {
  public get typeName(): string {
    return 'SaltMineBuiltInEchoProcessor';
  }

  public async handleEvent(data: any, metaData: any, cfg?: SaltMineConfig): Promise<void> {
    Logger.info('Echo processing : %j : %j', data, metaData);
  }
}