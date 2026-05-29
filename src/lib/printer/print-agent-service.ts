const PRINT_AGENT_URL = 'http://localhost:3210';

export interface PrintPayload {
  ip: string;
  port: number;
  type: 'raw';
  content: string | string[];
}

export async function sendPrintJob(payload: PrintPayload): Promise<any> {
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

  return response.json();
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
