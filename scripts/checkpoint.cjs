const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\..+/, '')
  .replace('T', '-');
const backupRoot = path.join(root, '.checkpoints', `checkpoint-${stamp}`);

const filesToCopy = [
  'src/App.tsx',
  'src/components/RestaurantView.tsx',
  'src/components/EmployeeView.tsx',
  'src/components/AccountantView.tsx',
  'src/components/DeliveryView.tsx',
  'src/components/HrView.tsx',
  'src/components/ProfileDrawer.tsx',
  'src/components/AppErrorBoundary.tsx',
  'src/types.ts',
  'src/data/mockData.ts',
  'src/data/hospitalOptions.ts',
  'src/data/usersDirectoryFallback.ts',
  'src/lib/firebase.ts',
  'src/lib/business.ts',
  'src/lib/deliveryCodes.ts',
  'src/lib/qzPrinter.ts',
  'src/lib/secureBalance.ts',
  'firestore.rules',
  'firebase.json',
  'package.json',
  'package-lock.json',
  'public/sw.js',
  'public/manifest.webmanifest',
  'vite.config.ts',
  'capacitor.config.ts',
];

fs.mkdirSync(backupRoot, { recursive: true });

for (const relativeFile of filesToCopy) {
  const source = path.join(root, relativeFile);
  if (!fs.existsSync(source)) continue;
  const destination = path.join(backupRoot, relativeFile);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

const writeCommandOutput = (command, outputFile) => {
  try {
    const output = execSync(command, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    fs.writeFileSync(path.join(backupRoot, outputFile), output, 'utf8');
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout) : '';
    const stderr = error.stderr ? String(error.stderr) : '';
    fs.writeFileSync(path.join(backupRoot, outputFile), `${stdout}\n${stderr}`.trim(), 'utf8');
  }
};

writeCommandOutput('git status --short', 'git-status.txt');
writeCommandOutput('git diff', 'working-tree.diff');
writeCommandOutput('git log --oneline -20', 'git-log.txt');

console.log(`Checkpoint créé: ${backupRoot}`);
