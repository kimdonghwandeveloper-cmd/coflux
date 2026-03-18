import { execSync } from 'child_process';
import fs from 'fs';

const pkgPath = './package.json';
const cargoPath = './src-tauri/Cargo.toml';

// 1. Read current version
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let nextVersion = process.argv[2];

// 2. Default to patch bump if no version provided
if (!nextVersion) {
  const parts = pkg.version.split('.').map(Number);
  parts[2] += 1;
  nextVersion = parts.join('.');
}

console.log(`\n🚀 Preparing release for v${nextVersion}...`);

// 3. Update package.json
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✅ Updated package.json to ${nextVersion}`);

// 4. Update Cargo.toml
try {
  let cargo = fs.readFileSync(cargoPath, 'utf8');
  cargo = cargo.replace(/^version = "[^"]+"$/m, `version = "${nextVersion}"`);
  fs.writeFileSync(cargoPath, cargo);
  console.log(`✅ Updated Cargo.toml to ${nextVersion}`);
} catch (e) {
  console.warn(`⚠️ Could not update Cargo.toml: ${e.message}`);
}

const tagName = `v${nextVersion}`;

// 5. Git Operations
try {
  console.log('📦 Committing and tagging...');
  execSync(`git add .`);
  execSync(`git commit -m "chore: bump version to ${nextVersion}"`);
  execSync(`git tag ${tagName}`);
  
  console.log(`📤 Pushing changes and tag to origin...`);
  execSync(`git push origin main`); // Assuming 'main' is the branch
  execSync(`git push origin ${tagName}`);
  
  console.log(`\n✨ Successfully released ${tagName}!`);
  console.log('🔗 Check your GitHub Actions tab to monitor the build progress.');
} catch (e) {
  console.error('\n❌ Error during git operations:', e.message);
  process.exit(1);
}
