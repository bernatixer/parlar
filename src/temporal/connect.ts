export interface TemporalConnectOptions {
  address: string;
  tls?: boolean;
  apiKey?: string;
  metadata?: Record<string, string>;
}

export function getTemporalAddress(): string {
  return process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
}

export function getTemporalNamespace(): string {
  return process.env.TEMPORAL_NAMESPACE ?? "default";
}

/**
 * Build connect options from env. When TEMPORAL_API_KEY is present, we assume
 * Temporal Cloud and turn on TLS + the namespace routing header. Otherwise we
 * fall back to a plaintext local-dev connection.
 */
export function getTemporalConnectOptions(): TemporalConnectOptions {
  const address = getTemporalAddress();
  const namespace = getTemporalNamespace();
  const apiKey = process.env.TEMPORAL_API_KEY;

  if (!apiKey) {
    return { address };
  }

  return {
    address,
    tls: true,
    apiKey,
    metadata: { "temporal-namespace": namespace },
  };
}
