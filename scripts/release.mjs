import { execSync } from 'child_process';
import fs from 'fs';

const pkgPath = './package.json';
const cargoPath = './src-tauri/Cargo.toml';
const tauriConfigPath = './src-tauri/tauri.conf.json';

// 1. Read current version from package.json
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let nextVersion = process.argv[2];

// 2. Default to patch bump if no version provided (e.g., 0.1.1 -> 0.1.2)
if (!nextVersion) {
  let [major, minor, patch] = pkg.version.split('.').map(Number);
  patch += 1;
  if (patch > 10) {
    minor += 1;
    patch = 1;
  }
  nextVersion = [major, minor, patch].join('.');
}

console.log(`\n🚀 Preparing release for v${nextVersion}...`);

// 3. Update package.json
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✅ Updated package.json to ${nextVersion}`);

// 4. Update src-tauri/Cargo.toml
try {
  let cargo = fs.readFileSync(cargoPath, 'utf8');
  cargo = cargo.replace(/^version = "[^"]+"$/m, `version = "${nextVersion}"`);
  fs.writeFileSync(cargoPath, cargo);
  console.log(`✅ Updated Cargo.toml to ${nextVersion}`);
} catch (e) {
  console.warn(`⚠️ Could not update Cargo.toml: ${e.message}`);
}

// 5. Update src-tauri/tauri.conf.json (Tauri v2)
try {
  const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
  tauriConfig.version = nextVersion;
  fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2) + '\n');
  console.log(`✅ Updated tauri.conf.json to ${nextVersion}`);
} catch (e) {
  console.warn(`⚠️ Could not update tauri.conf.json: ${e.message}`);
}

// 6. Force update Cargo.lock to match the new version in Cargo.toml
try {
  console.log('🔄 Syncing Cargo.lock...');
  execSync(`cargo metadata --manifest-path ${cargoPath} --format-version 1`, { stdio: 'ignore' });
  console.log(`✅ Synced Cargo.lock to ${nextVersion}`);
} catch (e) {
  console.warn(`⚠️ Could not sync Cargo.lock: ${e.message}`);
}

const tagName = `v${nextVersion}`;

// 7. Git Operations
try {
  // Get current branch name dynamically
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  console.log(`📦 Currently on branch: ${currentBranch}`);

  console.log('📦 Committing and tagging...');
  execSync(`git add .`);
  execSync(`git commit -m "chore: bump version to ${nextVersion}"`);
  execSync(`git tag ${tagName}`);
  
  console.log(`📤 Pushing changes and tag to origin...`);
  execSync(`git push origin ${currentBranch}`);
  execSync(`git push origin ${tagName}`);
  
  console.log(`\n✨ Successfully released ${tagName}!`);
  console.log('🔗 Check your GitHub Actions tab to monitor the MSI/EXE and DMG/APP build progress.');
} catch (e) {
  console.error('\n❌ Error during git operations:', e.message);
  process.exit(1);
}
