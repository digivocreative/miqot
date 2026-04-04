import * as cheerio from 'cheerio';
import fs from 'fs';

const html2 = fs.readFileSync('./tmp-umrah-detail.html', 'utf-8');
const $2 = cheerio.load(html2);

console.log("=== ALL INPUTS ===");
$2('input, select, textarea').each((i, el) => {
    console.log(`[${$2(el).prop('tagName')}] name="${$2(el).attr('name')}" type="${$2(el).attr('type')}" class="${$2(el).attr('class')}" value="${$2(el).val()}"`);
});

console.log("\n=== ALL TD TEXT ===");
let tds = [];
$2('table tr td').each((i, el) => {
   const text = $2(el).text().replace(/\s+/g, ' ').trim();
   if (text.length > 0 && text.length < 50) tds.push(text);
});
console.log(tds.slice(0, 30).join(' | '));
