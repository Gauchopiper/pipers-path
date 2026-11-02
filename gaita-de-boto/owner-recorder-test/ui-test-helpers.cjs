// Read the production dictionary and error classifier, rather than duplicating UI copy.
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const dictionaries=new Function(html.slice(html.indexOf('  const TEXT = {'),html.indexOf('const t = TEXT[uiLanguage];'))+';return TEXT;')();
const isAuthorizationError=new Function(html.slice(html.indexOf('function isAuthorizationError('),html.indexOf('function userError('))+';return isAuthorizationError;')();
module.exports={dictionaries,isAuthorizationError};
