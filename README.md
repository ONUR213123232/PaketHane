# 🚀 PaketHane Backend API

**Maksimum Güvenlikli Kurye Takip Sistemi**

## 📋 Özellikler

✅ **Güvenlik**
- JWT Authentication (Access + Refresh Token)
- bcrypt Password Hashing (12 rounds)
- Rate Limiting (DDoS koruması)
- Helmet.js (HTTP Security Headers)
- Account Locking (5 hatalı denemede)
- Audit Logging (Tüm işlemler kayıt altında)
- SQL Injection koruması (Prisma ORM)

✅ **Real-time**
- Socket.io ile anlık konum güncellemeleri
- Admin panel'e canlı bildirimler

✅ **Özellikler**
- Giriş/Kayıt sistemi
- GPS konum takibi
- Mesai yönetimi (Başlat/Durdur/Mola)
- Kurye yönetimi (Admin)
- Dashboard istatistikleri

---

## 🛠️ Kurulum

### 1. Gereksinimler
```bash
Node.js 18+ 
npm veya yarn
PostgreSQL (Neon)
```

### 2. Paketleri Yükle
```bash
cd backend
npm install
```

### 3. Environment Variables (.env)
```
✅ Zaten oluşturuldu!
DATABASE_URL bağlantısı hazır
```

### 4. Prisma Setup
```bash
# Prisma client oluştur
npx prisma generate

# Database migrate (tabloları oluştur)
npx prisma migrate dev --name init

# İlk admin ve test kullanıcıları ekle
npm run seed
```

### 5. Sunucuyu Başlat
```bash
# Development
npm run dev

# Production
npm start
```

---

## 🔐 İlk Giriş Bilgileri

**Admin:**
- E-posta: `admin@pakethane.com`
- Şifre: `admin123456`
- ⚠️ **İLK GİRİŞTEN SONRA DEĞİŞTİR!**

**Test Kuryeler:**
- E-posta: `ahmet@pakethane.com`
- Şifre: `kurye123`

---

## 📡 API Endpoints

### Authentication
```
POST /api/auth/login          - Giriş yap
POST /api/auth/register       - Yeni kullanıcı (Admin)
POST /api/auth/refresh        - Token yenile
POST /api/auth/logout         - Çıkış yap
```

### Location (GPS)
```
POST /api/location/update     - Konum güncelle
GET  /api/location/last/:id   - Son konum
GET  /api/location/history    - Konum geçmişi
```

### Session (Mesai)
```
POST /api/session/start       - Mesai başlat
POST /api/session/end         - Mesai bitir
POST /api/session/break/start - Mola başlat
POST /api/session/break/end   - Mola bitir
GET  /api/session/active      - Aktif mesai
GET  /api/session/history     - Mesai geçmişi
```

### Courier (Kurye Yönetimi)
```
GET   /api/courier/active         - Aktif kuryeler
GET   /api/courier/all            - Tüm kuryeler (Admin)
GET   /api/courier/:id            - Kurye detayı
PATCH /api/courier/:id/status     - Aktif/Pasif (Admin)
GET   /api/courier/stats/dashboard - Dashboard istatistikleri
```

---

## 🔒 Güvenlik Özellikleri

### 1. JWT Authentication
```javascript
// Header
Authorization: Bearer <token>

// Token süresi: 1 saat
// Refresh token: 7 gün
```

### 2. Password Hashing
```
bcrypt 12 rounds
Şifreler asla plain text saklanmaz
```

### 3. Rate Limiting
```
15 dakikada 100 istek
Aşımda 429 Too Many Requests
```

### 4. Account Locking
```
5 hatalı deneme = 15 dakika kilit
```

### 5. Audit Logging
```
Tüm login/logout/location update kayıt altında
IP adresi + User Agent kaydı
```

---

## 📊 Database Schema

### Users
- ID, Email, Password (hashed)
- Role (ADMIN / COURIER)
- Security (failedAttempts, lockedUntil, refreshToken)

### Locations
- GPS Data (lat, lng, accuracy, speed)
- Device Info (battery, deviceId)
- Timestamp

### Sessions
- Start/End Time
- Status (ACTIVE / ON_BREAK / COMPLETED)
- Breaks (JSON array)
- Total Duration & Distance

### AuditLogs
- Action, Details
- IP Address, User Agent
- Timestamp

---

## 🎯 Test

### Postman Collection
```bash
# Login
POST http://localhost:3000/api/auth/login
{
  "email": "admin@pakethane.com",
  "password": "admin123456"
}

# Konum Güncelle
POST http://localhost:3000/api/location/update
Headers: Authorization: Bearer <token>
{
  "latitude": 41.0082,
  "longitude": 28.9784,
  "speed": 15,
  "battery": 85
}
```

---

## 🚀 Production Deployment

### Railway.app / Render.com
```
1. GitHub'a push
2. Railway/Render'a bağla
3. Environment variables ekle
4. Auto-deploy ✅
```

### Güvenlik Kontrol Listesi
```
✅ JWT_SECRET değiştir (güçlü)
✅ Admin şifresi değiştir
✅ CORS_ORIGIN belirli domain'e çek
✅ HTTPS zorunlu
✅ Rate limit ayarla
✅ Database backup aktif
```

---

## 📝 Logs

### Development
```bash
npm run dev
# Morgan 'dev' format
```

### Production
```bash
npm start
# Morgan 'combined' format
```

---

## 🆘 Sorun Giderme

### Prisma Hatası
```bash
npx prisma generate
npx prisma migrate reset
npm run seed
```

### Port Kullanımda
```bash
# .env dosyasında PORT değiştir
PORT=3001
```

### Database Bağlantı Hatası
```bash
# DATABASE_URL kontrol et
# Neon dashboard'da connection string kopyala
```

---

## 📞 İletişim

**Proje:** PaketHane Kurye Takip Sistemi
**Version:** 1.0.0
**License:** ISC

---

## 🎉 Hazır!

Sunucu çalışıyor: `http://localhost:3000`

**Sonraki adımlar:**
1. Flutter App (Kurye)
2. Admin Panel (Web)
3. Deploy (Production)
