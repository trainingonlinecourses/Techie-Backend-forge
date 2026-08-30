const fs = require('fs');
const path = require('path');

const lessonsDir = path.join(__dirname, '..', 'backend', 'src', 'main', 'resources', 'content', 'lessons');
let fixed = 0;
let alreadyOk = 0;
let total = 0;

function processDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(fullPath);
    } else if (entry.name.endsWith('.md')) {
      total++;
      const content = fs.readFileSync(fullPath, 'utf8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---([\s\S]*)/);
      if (!fmMatch) continue;

      const fmLines = fmMatch[1].split('\n');
      const body = fmMatch[2];

      // Find summary and docs positions
      let summaryIdx = -1;
      let docsIdx = -1;
      for (let i = 0; i < fmLines.length; i++) {
        const trimmed = fmLines[i].trim();
        if (trimmed.startsWith('summary:') && summaryIdx === -1) summaryIdx = i;
        if (trimmed === 'docs:' && docsIdx === -1) docsIdx = i;
      }

      // If summary comes after docs, reorder
      if (summaryIdx > docsIdx && docsIdx >= 0 && summaryIdx >= 0) {
        // Extract summary line
        const summaryLine = fmLines[summaryIdx];
        // Remove it from current position
        fmLines.splice(summaryIdx, 1);
        // Insert it before docs
        const newDocsIdx = fmLines.findIndex(l => l.trim() === 'docs:');
        fmLines.splice(newDocsIdx, 0, summaryLine);

        const newFm = fmLines.join('\n');
        const newContent = '---\n' + newFm + '\n---' + body;
        fs.writeFileSync(fullPath, newContent, 'utf8');
        fixed++;
        console.log('REORDERED:', path.relative(lessonsDir, fullPath));
      } else {
        alreadyOk++;
      }
    }
  }
}

processDir(lessonsDir);
console.log('\n=== Results ===');
console.log('Total:', total, '| Already OK:', alreadyOk, '| Reordered:', fixed);
