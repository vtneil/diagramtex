const {chromium}=require('playwright');
const fs=require('fs');const path=require('path');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const dir=__dirname;fs.mkdirSync(path.join(dir,'final'),{recursive:true});
for(const item of JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')))){
 const url='file://'+path.join(dir,item.file.replace('.png','.html'));
 await page.goto(url);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('h1,.sub,.aside,.hero,.footer')].filter(el=>{let r=el.getBoundingClientRect();return r.right>1920||r.bottom>1080||r.left<0}).map(el=>el.className));
 if(overflow.length)throw Error(item.file+' overflow: '+overflow);
 await page.screenshot({path:path.join(dir,'final',item.file)});console.log(item.file);
}
await page.goto('file://'+path.join(dir,'contact.html'));
await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode()));});
await page.screenshot({path:path.join(dir,'contact-sheet.png')});
await browser.close();})();
