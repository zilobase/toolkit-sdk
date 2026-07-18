export function vercelProvider(): never {
  throw new Error(
    "@notelab/toolkit-vercel is server-only because Toolkit project API keys cannot be shipped to browser JavaScript.",
  );
}
