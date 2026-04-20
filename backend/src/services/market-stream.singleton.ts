import { MarketStreamService } from './market-stream.service';
import { SmartAPIService } from './smartapi.service';

// One Angel socket per process. Instantiated lazily so tests (which shouldn't
// reach Angel) don't trigger a connection.
let instance: MarketStreamService | null = null;

export function getMarketStream(): MarketStreamService {
  if (!instance) {
    instance = new MarketStreamService(new SmartAPIService());
  }
  return instance;
}

/** Call on server shutdown. */
export async function closeMarketStream(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
