import readline from "node:readline/promises";
import { promisify } from 'node:util';
import { exec } from 'node:child_process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const certName = await rl.question(`Name of the cert? `);
const expiresInDays = (await rl.question(`Expires in days? (default 365)? `)) || '365';
const encryptionStrength = (await rl.question(`Encryption strength RSA: (default 4096)? `)) || '4096';
const digestAlgorithm = (await rl.question(`Digest algorithm (default sha256)? `)) || 'sha256';

const companyName = await rl.question(`Company Name? `);
const city = await rl.question(`City? `);
const state = await rl.question(`State? `);
const hostName = await rl.question(`Hostname? `);

rl.close();

const subj = `/O=${companyName}/L=${city}/ST=${state}/CN=${hostName}`;
const cmd = `openssl req -x509 -newkey rsa:${encryptionStrength} -keyout ./certs/${certName ? `${certName}.` : '' }key.pem -out ./certs/${certName ? `${certName}.` : '' }cert.pem -${digestAlgorithm} -days ${expiresInDays} -nodes -subj "${subj}"`;

await promisify(exec)(cmd);

console.log();
console.log('Your certificates are located at:');
console.log(`${process.cwd()}\\certs\\${certName ? `${certName}.` : '' }cert.pem`);
console.log(`${process.cwd()}\\certs\\${certName ? `${certName}.` : '' }key.pem`);
console.log();