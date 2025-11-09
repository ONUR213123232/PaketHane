// Location Routes - GPS Takip Sistemi
// Real-time konum güncellemeleri + Socket.io

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const prisma = new PrismaClient();

// ============ KONUM GÜNCELLE (Kurye App'inden) ============

router.post('/update', [
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Geçerli latitude gerekli'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Geçerli longitude gerekli')
], async (req, res) => {
  try {
    const userId = req.user.id;
    const userName = req.user.name;
    const { latitude, longitude, accuracy, speed, heading, altitude, battery, deviceId } = req.body;
    
    console.log('');
    console.log('📍 ========== GPS VERİSİ GELDİ ==========');
    console.log(`👤 Kullanıcı: ${userName} (${userId})`);
    console.log(`📌 Konum: ${latitude}, ${longitude}`);
    console.log(`🏍️ Hız: ${speed} m/s (${(speed * 3.6).toFixed(1)} km/h)`);
    console.log(`🎯 Doğruluk: ${accuracy} metre`);
    console.log(`🔋 Batarya: ${battery}%`);
    console.log('==========================================');
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    // Konum kaydı oluştur
    const location = await prisma.location.create({
      data: {
        userId,
        latitude,
        longitude,
        accuracy,
        speed,
        heading,
        altitude,
        battery,
        deviceId
      }
    });
    
    // Aktif session'ı bul ve mesafeyi güncelle
    const activeSession = await prisma.session.findFirst({
      where: {
        userId,
        OR: [
          { status: 'ACTIVE' },
          { status: 'ON_BREAK' }
        ]
      },
      orderBy: {
        startTime: 'desc'
      }
    });
    
    // Socket.io'yu al
    const io = req.app.get('io');
    
    if (activeSession) {
      // Süreyi güncelle (dakika olarak)
      const now = new Date();
      const durationMinutes = Math.floor((now - new Date(activeSession.startTime)) / 60000);
      
      // Son konumu al
      const lastLocation = await prisma.location.findFirst({
        where: {
          userId,
          timestamp: {
            lt: location.timestamp
          }
        },
        orderBy: {
          timestamp: 'desc'
        }
      });
      
      let newDistance = activeSession.totalDistance;
      
      if (lastLocation) {
        // Mesafe hesapla (Haversine formülü)
        const R = 6371; // Dünya yarıçapı (km)
        const dLat = (latitude - lastLocation.latitude) * Math.PI / 180;
        const dLon = (longitude - lastLocation.longitude) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lastLocation.latitude * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        // Makul mesafe kontrolü
        // 1. GPS drift filtreleme: Minimum 10 metre hareket gerekli
        // 2. Maksimum hız kontrolü: 10 saniyede max 0.5 km (180 km/h)
        if (distance >= 0.01 && distance < 0.5) {
          newDistance = activeSession.totalDistance + distance;
          console.log(`✅ Mesafe eklendi: ${distance.toFixed(4)} km (Toplam: ${newDistance.toFixed(2)} km)`);
        } else if (distance < 0.01) {
          console.log(`🚫 GPS drift filtrelendi: ${distance.toFixed(4)} km (çok küçük)`);
        } else {
          console.log(`🚫 Anormal mesafe filtrelendi: ${distance.toFixed(4)} km (çok büyük)`);
        }
      }
      
      // Session güncelle
      const updatedSession = await prisma.session.update({
        where: { id: activeSession.id },
        data: {
          totalDistance: newDistance,
          totalDuration: durationMinutes
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
            }
          }
        }
      });
      
      // Socket.io ile stats broadcast et
      io.emit('stats-update', {
        userId: userId,
        userName: req.user.name,
        stats: {
          totalDistance: newDistance.toFixed(2),
          totalDuration: durationMinutes,
          deliveryCount: updatedSession.deliveryCount
        }
      });
    }
    
    // Real-time güncelleme - Socket.io ile admin'e gönder
    const socketData = {
      userId: req.user.id,
      userName: req.user.name,
      latitude,
      longitude,
      speed,
      battery,
      timestamp: location.timestamp
    };
    io.emit('location-update', socketData);
    
    console.log(`🔄 Socket.io EMIT: location-update → Admin`);
    console.log(`   Veri: ${userName} @ (${latitude}, ${longitude})`);
    
    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'LOCATION_UPDATE',
        details: { latitude, longitude, speed }
      }
    });
    
    res.json({
      success: true,
      message: '📍 Konum güncellendi',
      data: { location }
    });
    
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Konum güncellenemedi!'
    });
  }
});

// ============ SON KONUM AL ============

router.get('/last/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    
    // Admin değilse sadece kendi konumunu görebilir
    if (req.user.role !== 'ADMIN' && userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: '🚫 Bu konumu görme yetkiniz yok!'
      });
    }
    
    const location = await prisma.location.findFirst({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true
          }
        }
      }
    });
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: '📍 Konum bulunamadı'
      });
    }
    
    res.json({
      success: true,
      data: { location }
    });
    
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Konum alınamadı!'
    });
  }
});

// ============ KONUM GEÇMİŞİ ============

router.get('/history/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    const { startDate, endDate, limit = 100 } = req.query;
    
    // Admin değilse sadece kendi geçmişini görebilir
    if (req.user.role !== 'ADMIN' && userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: '🚫 Bu geçmişi görme yetkiniz yok!'
      });
    }
    
    const where = { userId };
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }
    
    const locations = await prisma.location.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: {
        count: locations.length,
        locations
      }
    });
    
  } catch (error) {
    console.error('Location history error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Geçmiş alınamadı!'
    });
  }
});

module.exports = router;
