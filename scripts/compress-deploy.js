import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const deployDir = path.resolve('deploy');
const zipFile = path.resolve('deploy.zip');

if (!fs.existsSync(deployDir)) {
    console.error('Error: deploy directory does not exist.');
    process.exit(1);
}

if (fs.existsSync(zipFile)) {
    fs.unlinkSync(zipFile);
}

console.log('Compressing deploy folder to deploy.zip...');

try {
    if (process.platform === 'win32') {
        execSync(`powershell -Command "Compress-Archive -Path '${deployDir}\\*' -DestinationPath '${zipFile}' -Force"`, { stdio: 'inherit' });
    } else {
        execSync(`zip -r "${zipFile}" .`, { cwd: deployDir, stdio: 'inherit' });
    }
    console.log('Successfully created deploy.zip!');
} catch (err) {
    console.error('Failed to create deploy.zip:', err.message);
    process.exit(1);
}
