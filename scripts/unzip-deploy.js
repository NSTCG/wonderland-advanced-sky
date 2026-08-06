import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const zipFile = path.resolve('deploy.zip');
const deployDir = path.resolve('deploy');

if (!fs.existsSync(zipFile)) {
    console.error('Error: deploy.zip does not exist.');
    process.exit(1);
}

console.log('Unzipping deploy.zip to deploy/ directory...');

try {
    if (process.platform === 'win32') {
        execSync(`powershell -Command "Expand-Archive -Path '${zipFile}' -DestinationPath '${deployDir}' -Force"`, { stdio: 'inherit' });
    } else {
        try {
            execSync(`python3 -m zipfile -e "${zipFile}" "${deployDir}"`, { stdio: 'inherit' });
        } catch (e) {
            execSync(`unzip -o "${zipFile}" -d "${deployDir}"`, { stdio: 'inherit' });
        }
    }
    console.log('Successfully unzipped deploy.zip to deploy/ directory!');
} catch (err) {
    console.error('Failed to unzip deploy.zip:', err.message);
    process.exit(1);
}
