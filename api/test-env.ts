export default async function handler(req: any, res: any) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      host: !!process.env.SMTP_HOST,
      port: !!process.env.SMTP_PORT,
      user: !!process.env.SMTP_USER,
      pass: !!process.env.SMTP_PASS,
      from: !!process.env.SMTP_FROM,
    })
  );
}
