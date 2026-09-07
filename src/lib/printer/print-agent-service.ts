const PRINT_AGENT_URL = 'http://localhost:4545';

export interface PrintPayload {
  ip: string;
  port: number;
  type: 'raw';
  content: string | string[];
}

export interface PrintAgentResponse {
  success?: boolean;
  message?: string;
}

function isPrintAgentResponse(value: unknown): value is PrintAgentResponse {
  return typeof value === 'object' && value !== null;
}

export async function sendPrintJob(payload: PrintPayload): Promise<PrintAgentResponse> {
  const response = await fetch(`${PRINT_AGENT_URL}/print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Print agent unavailable');
  }

  const body: unknown = await response.json();
  return isPrintAgentResponse(body) ? body : {};
}

export async function checkAgentHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PRINT_AGENT_URL}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}
