const fs = require('fs');
const path = require('path');

const lessonsDir = path.join(__dirname, '..', 'backend', 'src', 'main', 'resources', 'content', 'lessons');
let fixed = 0;
let alreadyGood = 0;
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
      if (!fmMatch) {
        console.log('NO FRONTMATTER:', fullPath);
        continue;
      }

      const fm = fmMatch[1];
      const body = fmMatch[2].trim();

      // Check if summary exists and is meaningful (not empty, not just whitespace)
      const summaryMatch = fm.match(/^summary:\s*(.+)$/m);
      const existingSummary = summaryMatch ? summaryMatch[1].trim() : '';

      if (existingSummary.length >= 20) {
        alreadyGood++;
        continue;
      }

      // Extract title
      const titleMatch = fm.match(/^title:\s*(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : path.basename(fullPath, '.md');

      // Extract first meaningful paragraph from body (skip headings)
      const lines = body.split('\n');
      let firstParagraph = '';
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines, headings, code blocks, and separators
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('```') || trimmed.startsWith('---') || trimmed.startsWith('|')) continue;
        firstParagraph = trimmed;
        break;
      }

      // Generate a summary: use first paragraph if it's long enough, otherwise use title
      let newSummary;
      if (firstParagraph.length > 30) {
        // Take first sentence or first 160 chars
        const periodIdx = firstParagraph.indexOf('.');
        if (periodIdx > 20 && periodIdx < 200) {
          newSummary = firstParagraph.substring(0, periodIdx + 1);
        } else {
          newSummary = firstParagraph.substring(0, 160);
          if (firstParagraph.length > 160) newSummary += '...';
        }
      } else {
        newSummary = title;
      }

      // Replace or add summary in frontmatter
      let newFm;
      if (summaryMatch) {
        // Replace existing empty/short summary
        newFm = fm.replace(/^summary:\s*.+$/m, 'summary: ' + newSummary);
      } else {
        // Add summary after title line
        newFm = fm.replace(/^(title:\s*.+)$/m, '$1\nsummary: ' + newSummary);
      }

      const newContent = '---\n' + newFm + '\n---' + fmMatch[2];
      fs.writeFileSync(fullPath, newContent, 'utf8');
      fixed++;
      console.log('FIXED:', path.relative(lessonsDir, fullPath), '=>', newSummary.substring(0, 80));
    }
  }
}

processDir(lessonsDir);
console.log('\n=== Results ===');
console.log('Total files:', total);
console.log('Already good:', alreadyGood);
console.log('Fixed:', fixed);
