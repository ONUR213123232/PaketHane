// PaketHane Kurye Takip Sistemi - Backend Server
// Maksimum Güvenlik + Real-time Tracking

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');

// Routes
const authRoutes = require('./routes/auth');
const locationRoutes = require('./routes/location');
const sessionRoutes = require('./routes/session');
const courierRoutes = require('./routes/courier');
const statsRoutes = require('./routes/stats');
const deliveryRoutes = require('./routes/delivery');

// Middleware
const { authenticateToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Production'da belirli domain'e çek!
    methods: ["GET", "POST"]
  }
});

// ============ SECURITY MIDDLEWARE ============

// Helmet - HTTP headers güvenliği
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Rate Limiting - DDoS koruması (sadece production'da)
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000 || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
    message: '⚠️ Çok fazla istek! Lütfen daha sonra tekrar deneyin.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);
  console.log('✅ Rate limiter aktif (Production)');
} else {
  console.log('⚠️ Rate limiter devre dışı (Development)');
}

// Body parser
app.use(express.json({ limit: '10kb' })); // Payload limit
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ============ SOCKET.IO (Real-time) ============

const activeAdmins = new Set();

io.on('connection', (socket) => {
  console.log(`📡 Client bağlandı: ${socket.id}`);
  
  // Admin olarak kaydet
  socket.on('register-admin', () => {
    activeAdmins.add(socket.id);
    console.log(`👤 Admin kaydedildi: ${socket.id}`);
  });
  
  socket.on('disconnect', () => {
    activeAdmins.delete(socket.id);
    console.log(`📴 Client ayrıldı: ${socket.id}`);
  });
});

// Socket.io'yu routes'larda kullanabilmek için
app.set('io', io);

// ============ ROUTES ============

// Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 PaketHane API çalışıyor!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/location', authenticateToken, locationRoutes);
app.use('/api/session', authenticateToken, sessionRoutes);
app.use('/api/stats', authenticateToken, statsRoutes);
app.use('/api/courier', authenticateToken, courierRoutes);
app.use('/api/delivery', authenticateToken, deliveryRoutes);

// ============ ERROR HANDLING ============

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '❌ Endpoint bulunamadı'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  
  // Prisma hataları
  if (err.code === 'P2002') {
    return res.status(400).json({
      success: false,
      message: '⚠️ Bu kayıt zaten mevcut'
    });
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '❌ Sunucu hatası',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============ START SERVER ============

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('');
  console.log('🚀 ================================');
  console.log('🚀 PaketHane Backend BAŞLADI!');
  console.log('🚀 ================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV}`);
  console.log(`🗄️  Database: Neon PostgreSQL`);
  console.log(`🔐 Security: MAKSIMUM`);
  console.log('🚀 ================================');
  console.log('');
  
  // Periyodik GPS durum raporu (her 30 saniyede)
  setInterval(async () => {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      // Aktif session'ları bul
      const activeSessions = await prisma.session.findMany({
        where: {
          status: { in: ['ACTIVE', 'ON_BREAK'] }
        },
        include: {
          user: {
            include: {
              locations: {
                orderBy: { timestamp: 'desc' },
                take: 1
              }
            }
          }
        }
      });
      
      if (activeSessions.length > 0) {
        console.log('');
        console.log('📊 ========== ONLİNE KULLANICILAR GPS DURUM RAPORU ==========');
        console.log(`⏰ Zaman: ${new Date().toLocaleString('tr-TR')}`);
        console.log(`👥 Online Kullanıcı: ${activeSessions.length}`);
        console.log('');
        
        activeSessions.forEach((session, index) => {
          const user = session.user;
          const lastLocation = user.locations[0];
          
          console.log(`${index + 1}. 👤 ${user.name} (${user.id})`);
          console.log(`   📌 Durum: ${session.status === 'ACTIVE' ? '🟢 ÇALIŞIYOR' : '🟡 MOLADA'}`);
          
          if (lastLocation) {
            const timeDiff = Math.floor((Date.now() - new Date(lastLocation.timestamp)) / 1000);
            console.log(`   📍 Konum: ${lastLocation.latitude}, ${lastLocation.longitude}`);
            console.log(`   🏍️ Hız: ${(lastLocation.speed * 3.6).toFixed(1)} km/h`);
            console.log(`   🔋 Batarya: ${lastLocation.battery}%`);
            console.log(`   ⏱️ Son Güncelleme: ${timeDiff} saniye önce`);
          } else {
            console.log(`   ❌ GPS VERİSİ YOK!`);
          }
          console.log('');
        });
        
        console.log('=========================================================');
      }
      
      await prisma.$disconnect();
    } catch (error) {
      console.error('❌ GPS raporu hatası:', error);
    }
  }, 30000); // 30 saniyede bir
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⏹️  SIGTERM alındı, sunucu kapatılıyor...');
  server.close(() => {
    console.log('✅ Sunucu kapatıldı');
    process.exit(0);
  });
});

module.exports = { app, io };
