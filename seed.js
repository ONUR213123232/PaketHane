// Database Seed - İlk Admin ve Test Kullanıcıları
// npm run seed ile çalıştır

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Veritabanı başlatılıyor...\n');
  
  // ============ ADMIN KULLANICISI ============
  
  const adminEmail = 'admin@pakethane.com';
  const adminPassword = 'admin123456'; // İLK GİRİŞTEN SONRA DEĞİŞTİR!
  
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail }
  });
  
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'Admin',
        role: 'ADMIN',
        active: true
      }
    });
    
    console.log('✅ Admin kullanıcısı oluşturuldu!');
    console.log(`📧 E-posta: ${adminEmail}`);
    console.log(`🔑 Şifre: ${adminPassword}`);
    console.log('⚠️  GÜVENLİK: İlk girişten sonra şifreyi değiştirin!\n');
  } else {
    console.log('✅ Admin kullanıcısı zaten mevcut!\n');
  }
  
  // ============ TEST KURYELERİ (Opsiyonel) ============
  
  const testCouriers = [
    { name: 'Ahmet Yılmaz', email: 'ahmet@pakethane.com', phone: '+905551234567' },
    { name: 'Mehmet Demir', email: 'mehmet@pakethane.com', phone: '+905551234568' },
    { name: 'Ayşe Kara', email: 'ayse@pakethane.com', phone: '+905551234569' }
  ];
  
  const defaultPassword = 'kurye123'; // Test için
  
  for (const courier of testCouriers) {
    const existing = await prisma.user.findUnique({
      where: { email: courier.email }
    });
    
    if (!existing) {
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);
      
      await prisma.user.create({
        data: {
          ...courier,
          password: hashedPassword,
          role: 'COURIER',
          active: true
        }
      });
      
      console.log(`✅ Test kuryesi oluşturuldu: ${courier.name}`);
    }
  }
  
  console.log('\n🎉 Seed tamamlandı!\n');
  
  // ============ ÖZET ============
  
  const totalUsers = await prisma.user.count();
  const totalCouriers = await prisma.user.count({ where: { role: 'COURIER' } });
  const totalAdmins = await prisma.user.count({ where: { role: 'ADMIN' } });
  
  console.log('📊 VERITABANI DURUMU:');
  console.log(`├─ Toplam Kullanıcı: ${totalUsers}`);
  console.log(`├─ Admin: ${totalAdmins}`);
  console.log(`└─ Kurye: ${totalCouriers}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
