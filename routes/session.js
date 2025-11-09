// Session Routes - Mesai Yönetimi
// Çalışma, Mola, Mesai Sonu

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ============ MESAİ BAŞLAT ============

router.post('/start', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Zaten aktif mesai var mı kontrol et
    const activeSession = await prisma.session.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'ON_BREAK'] }
      }
    });
    
    if (activeSession) {
      return res.status(400).json({
        success: false,
        message: '⚠️ Zaten aktif bir mesainiz var!'
      });
    }
    
    // Yeni mesai başlat
    const session = await prisma.session.create({
      data: {
        userId,
        startTime: new Date(),
        status: 'ACTIVE'
      }
    });
    
    // Socket.io ile admin'e bildir
    const io = req.app.get('io');
    io.emit('session-started', {
      userId: req.user.id,
      userName: req.user.name,
      sessionId: session.id,
      startTime: session.startTime
    });
    
    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'SESSION_STARTED',
        details: { sessionId: session.id }
      }
    });
    
    res.json({
      success: true,
      message: '✅ Mesai başlatıldı!',
      data: { session }
    });
    
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Mesai başlatılamadı!'
    });
  }
});

// ============ MOLA BAŞLAT ============

router.post('/break/start', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Aktif mesai bul
    const session = await prisma.session.findFirst({
      where: {
        userId,
        status: 'ACTIVE'
      }
    });
    
    if (!session) {
      return res.status(400).json({
        success: false,
        message: '⚠️ Aktif mesai bulunamadı!'
      });
    }
    
    // Mola listesini al (JSON veya Array)
    let breaks = [];
    if (session.breaks) {
      if (typeof session.breaks === 'string') {
        try {
          breaks = JSON.parse(session.breaks);
        } catch (e) {
          console.error('Break parse error:', e);
          breaks = [];
        }
      } else if (Array.isArray(session.breaks)) {
        breaks = session.breaks;
      }
    }
    
    // Yeni mola ekle
    const newBreak = {
      start: new Date().toISOString(),
      end: null,
      duration: 0
    };
    breaks.push(newBreak);
    
    console.log(`☕ Mola başlatıldı: ${new Date().toLocaleString('tr-TR')}`);
    console.log(`📊 Toplam mola sayısı: ${breaks.length}`);
    
    const updatedSession = await prisma.session.update({
      where: { id: session.id },
      data: {
        status: 'ON_BREAK',
        breaks: breaks
      }
    });
    
    // Socket.io
    const io = req.app.get('io');
    io.emit('break-started', {
      userId: req.user.id,
      userName: req.user.name,
      sessionId: session.id
    });
    
    res.json({
      success: true,
      message: '☕ Mola başladı!',
      data: { session: updatedSession }
    });
    
  } catch (error) {
    console.error('❌ Start break error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Mola başlatılamadı!',
      error: error.message
    });
  }
});

// ============ MOLA BİTİR ============

router.post('/break/end', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Molada olan mesai bul
    const session = await prisma.session.findFirst({
      where: {
        userId,
        status: 'ON_BREAK'
      }
    });
    
    if (!session) {
      return res.status(400).json({
        success: false,
        message: '⚠️ Molada olan mesai bulunamadı!'
      });
    }
    
    // Mola listesini al
    let breaks = [];
    if (session.breaks) {
      if (typeof session.breaks === 'string') {
        try {
          breaks = JSON.parse(session.breaks);
        } catch (e) {
          console.error('Break parse error:', e);
          breaks = [];
        }
      } else if (Array.isArray(session.breaks)) {
        breaks = session.breaks;
      }
    }
    
    // Son molayı bul ve bitir
    if (breaks.length > 0) {
      const lastBreak = breaks[breaks.length - 1];
      
      if (lastBreak && (!lastBreak.end || lastBreak.end === null)) {
        const breakStart = new Date(lastBreak.start);
        const breakEnd = new Date();
        const duration = Math.round((breakEnd - breakStart) / 60000); // dakika
        
        lastBreak.end = breakEnd.toISOString();
        lastBreak.duration = duration;
        
        console.log(`✅ Mola bitirildi!`);
        console.log(`   Başlangıç: ${breakStart.toLocaleString('tr-TR')}`);
        console.log(`   Bitiş: ${breakEnd.toLocaleString('tr-TR')}`);
        console.log(`   Süre: ${duration} dakika`);
      } else {
        console.log(`⚠️ Son mola zaten bitirilmiş!`);
      }
    } else {
      console.log(`⚠️ Hiç mola bulunamadı!`);
    }
    
    const updatedSession = await prisma.session.update({
      where: { id: session.id },
      data: {
        status: 'ACTIVE',
        breaks: breaks
      }
    });
    
    // Socket.io
    const io = req.app.get('io');
    io.emit('break-ended', {
      userId: req.user.id,
      userName: req.user.name,
      sessionId: session.id
    });
    
    res.json({
      success: true,
      message: '✅ Mola bitti, mesai devam ediyor!',
      data: { session: updatedSession }
    });
    
  } catch (error) {
    console.error('❌ End break error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Mola bitirilemedi!',
      error: error.message
    });
  }
});

// ============ MESAİ BİTİR ============

router.post('/end', async (req, res) => {
  try {
    const userId = req.user.id;
    const { totalDistance } = req.body;
    
    // Aktif mesai bul
    const session = await prisma.session.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'ON_BREAK'] }
      }
    });
    
    if (!session) {
      return res.status(400).json({
        success: false,
        message: '⚠️ Aktif mesai bulunamadı!'
      });
    }
    
    // Toplam süreyi hesapla (dakika)
    const startTime = new Date(session.startTime);
    const endTime = new Date();
    const totalDuration = Math.round((endTime - startTime) / 60000);
    
    // Mesaiyi bitir
    const updatedSession = await prisma.session.update({
      where: { id: session.id },
      data: {
        endTime,
        status: 'COMPLETED',
        totalDuration,
        totalDistance: totalDistance || 0
      }
    });
    
    // Socket.io
    const io = req.app.get('io');
    io.emit('session-ended', {
      userId: req.user.id,
      userName: req.user.name,
      sessionId: session.id,
      duration: totalDuration,
      distance: totalDistance
    });
    
    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'SESSION_ENDED',
        details: {
          sessionId: session.id,
          duration: totalDuration,
          distance: totalDistance
        }
      }
    });
    
    res.json({
      success: true,
      message: '✅ Mesai bitirildi!',
      data: { session: updatedSession }
    });
    
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Mesai bitirilemedi!'
    });
  }
});

// ============ AKTİF MESAİ AL ============

router.get('/active', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const session = await prisma.session.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'ON_BREAK'] }
      },
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
    
    res.json({
      success: true,
      data: { session }
    });
    
  } catch (error) {
    console.error('Get active session error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Mesai bilgisi alınamadı!'
    });
  }
});

// ============ MESAİ GEÇMİŞİ ============

router.get('/history', async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    const { startDate, endDate, limit = 30 } = req.query;
    
    // Admin değilse sadece kendi geçmişini görebilir
    if (req.user.role !== 'ADMIN' && userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: '🚫 Bu geçmişi görme yetkiniz yok!'
      });
    }
    
    const where = {
      userId,
      status: 'COMPLETED'
    };
    
    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = new Date(startDate);
      if (endDate) where.startTime.lte = new Date(endDate);
    }
    
    const sessions = await prisma.session.findMany({
      where,
      orderBy: { startTime: 'desc' },
      take: parseInt(limit)
    });
    
    // İstatistikler
    const stats = {
      totalSessions: sessions.length,
      totalDuration: sessions.reduce((sum, s) => sum + s.totalDuration, 0),
      totalDistance: sessions.reduce((sum, s) => sum + s.totalDistance, 0),
      avgDuration: sessions.length > 0 
        ? Math.round(sessions.reduce((sum, s) => sum + s.totalDuration, 0) / sessions.length)
        : 0
    };
    
    res.json({
      success: true,
      data: {
        sessions,
        stats
      }
    });
    
  } catch (error) {
    console.error('Session history error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Geçmiş alınamadı!'
    });
  }
});

module.exports = router;
