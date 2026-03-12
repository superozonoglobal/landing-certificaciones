// Script para probar URLs de Cloudflare R2
const testUrls = [
    'https://a7d0037fa11e8906bbb1f457f8c99893.r2.cloudflarestorage.com/certificaciones-ozono/Afiliado/modulo_1/intro.mp4',
    'https://a7d0037fa11e8906bbb1f457f8c99893.r2.cloudflarestorage.com/certificaciones-ozono/Afiliado/modulo_1/video.mp4',
    'https://a7d0037fa11e8906bbb1f457f8c99893.r2.cloudflarestorage.com/certificaciones-ozono/Afiliado/modulo_1/presentacion.mp4',
    'https://a7d0037fa11e8906bbb1f457f8c99893.r2.cloudflarestorage.com/certificaciones-ozono/Afiliado/modulo_1.mp4',
    'https://a7d0037fa11e8906bbb1f457f8c99893.r2.cloudflarestorage.com/certificaciones-ozono/Afiliado/modulo_1/master.m3u8'
];

console.log('🎬 Probando URLs de Cloudflare R2...\n');

testUrls.forEach((url, index) => {
    console.log(`${index + 1}. ${url}`);
    console.log(`   Tipo: ${url.endsWith('.m3u8') ? 'HLS Manifest' : 'MP4 Direct'}`);
    console.log(`   Esperado: Video de introducción del módulo 1\n`);
});

console.log('🔍 Para probar manualmente:');
console.log('1. Abre el navegador');
console.log('2. Pega cada URL en la barra de direcciones');
console.log('3. Si alguna funciona, esa es la URL correcta');
console.log('\n⚠️  Nota: Las URLs de R2 pueden requerir:');
console.log('- Configuración CORS en el bucket');
console.log('- URLs públicas (no privadas)');
console.log('- O un backend que sirva los archivos (como en kumo-ozono)');
