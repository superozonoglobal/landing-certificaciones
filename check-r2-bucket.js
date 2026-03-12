// Script para verificar el bucket de R2 usando AWS SDK
const { S3Client, ListObjectsCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

// Configuración de R2 con tus keys
const r2Client = new S3Client({
    region: 'auto',
    endpoint: 'https://a7d0037fa11e8906bbb1f457f8c99893.r2.cloudflarestorage.com',
    credentials: {
        accessKeyId: '1de3f939945e165d48933ca1921103cf',
        secretAccessKey: '5034698928b52eb1a2835fc82f85f4dcd2e5b7e4bce5f592fcf9345fe46df754'
    }
});

async function checkBucket() {
    try {
        console.log('🎬 Verificando bucket: certificaciones-ozono\n');
        
        // Listar objetos en el bucket
        const listCommand = new ListObjectsCommand({
            Bucket: 'certificaciones-ozono',
            Prefix: 'Afiliado/modulo_1/'
        });
        
        const response = await r2Client.send(listCommand);
        
        if (response.Contents && response.Contents.length > 0) {
            console.log('✅ Archivos encontrados en Afiliado/modulo_1/:');
            response.Contents.forEach(obj => {
                console.log(`📁 ${obj.Key}`);
                console.log(`   Tamaño: ${(obj.Size / 1024 / 1024).toFixed(2)} MB`);
                console.log(`   Última modificación: ${obj.LastModified}`);
                console.log('');
            });
            
            // Generar URLs públicas
            console.log('🔗 URLs públicas para probar:');
            response.Contents.forEach(obj => {
                const url = `https://a7d0037fa11e8906bbb1f457f8c99893.r2.cloudflarestorage.com/certificaciones-ozono/${obj.Key}`;
                console.log(url);
            });
            
        } else {
            console.log('❌ No se encontraron archivos en Afiliado/modulo_1/');
            console.log('\n🔍 Verificando todo el bucket...');
            
            const listAllCommand = new ListObjectsCommand({
                Bucket: 'certificaciones-ozono'
            });
            
            const allResponse = await r2Client.send(listAllCommand);
            
            if (allResponse.Contents && allResponse.Contents.length > 0) {
                console.log('📁 Todos los archivos en el bucket:');
                allResponse.Contents.forEach(obj => {
                    console.log(`   ${obj.Key}`);
                });
            } else {
                console.log('❌ El bucket está vacío o no es accesible');
            }
        }
        
    } catch (error) {
        console.error('❌ Error al verificar el bucket:', error.message);
        console.log('\n💡 Posibles soluciones:');
        console.log('1. Verifica que las keys de R2 sean correctas');
        console.log('2. Asegúrate que el bucket exista');
        console.log('3. Verifica los permisos de las keys');
    }
}

checkBucket();
