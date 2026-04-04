import * as cheerio from 'cheerio';
import fs from 'fs';

const html1 = fs.readFileSync('./tmp-umrah.html', 'utf-8');
const $1 = cheerio.load(html1);

console.log("=== UMRAH GENERAL PAGE ===");
console.log("Page Title:", $1('title').text() || $1('h1').first().text() || "No H1");
const tableHeaders = [];
$1('table th').each((i, el) => {
    tableHeaders.push($1(el).text().trim());
});
console.log(`Found ${$1('table tr').length} rows in the main table.`);
console.log("Table Headers (first 20):", tableHeaders.slice(0, 20).join(' | '));
const firstRowCells = [];
$1('table tr').eq(1).find('td').each((i, el) => {
    firstRowCells.push($1(el).text().replace(/\s+/g, ' ').trim());
});
console.log("Sample Data Row 1:", firstRowCells.slice(0, 10).join(' | '));

console.log("\n=== UMRAH DETAIL PAGE (ID: AIW0028623) ===");
const html2 = fs.readFileSync('./tmp-umrah-detail.html', 'utf-8');
const $2 = cheerio.load(html2);
console.log("Page Title:", $2('title').text() || $2('h1').first().text() || $2('.content-header h1').text().replace(/\s+/g, ' ').trim());

// Get all form inputs and their labels
const formData = [];
$2('.form-group').each((i, el) => {
    const label = $2(el).find('label').first().text().trim();
    // try to find inputs, selects, or textareas
    let value = $2(el).find('input[type="text"], input[type="number"], input[type="email"], select, textarea, input[type="date"], input[type="radio"]:checked').val();
    if (!value) {
        // maybe it's just static text
        const textCtx = $2(el).text().replace(label, '').replace(/\s+/g, ' ').trim();
        if (textCtx.length < 50 && textCtx !== "") value = "(Text) " + textCtx;
    }
    
    // Also look for checkbox/radio
    const radios = [];
    $2(el).find('input[type="radio"]').each((j, r) => {
       if ($2(r).prop('checked')) radios.push($2(r).attr('name') + "=" + $2(r).val()); 
    });
    if (radios.length > 0) value = "(Radio: " + radios.join(', ') + ")";
    
    if (label) {
        formData.push(`${label}: ${value || '[Empty/Unknown]'}`);
    }
});

console.log("Form Fields Extracted:");
formData.forEach(f => console.log(" - " + f));
