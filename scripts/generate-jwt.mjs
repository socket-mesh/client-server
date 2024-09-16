import readline from "node:readline/promises";
import { promisify } from 'node:util';
import { exec } from 'node:child_process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const certName = await rl.question(`Name of the cert? `);
const encryptionStrength = (await rl.question(`Encryption strength RSA: (default 4096)? `)) || '4096';

let cmd = `openssl genrsa -out "./certs/${certName ? `${certName}.` : '' }private.key" ${encryptionStrength}`;

await promisify(exec)(cmd);

cmd = `openssl rsa -in "./certs/${certName ? `${certName}.` : '' }private.key" -pubout -outform PEM -out "./certs/${certName ? `${certName}.` : '' }public.key"`;

await promisify(exec)(cmd);

rl.close();

console.log();
console.log('Your JWT keys are located located at:');
console.log(`${process.cwd()}\\certs\\${certName ? `${certName}.` : '' }private.key`);
console.log(`${process.cwd()}\\certs\\${certName ? `${certName}.` : '' }public.key`);
console.log();