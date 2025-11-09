// Teslimat API
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Teslimat tamamla
router.post('/complete', async (req, res) => {
  try {
    const userId = req.user.id;

    // Aktif session bul
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

    if (!activeSession) {
      return res.status(400).json({
        success: false,
        message: 'Aktif mesai bulunamadı!'
      });
    }

    // Teslimat sayısını artır
    const updatedSession = await prisma.session.update({
      where: { id: activeSession.id },
      data: {
        deliveryCount: activeSession.deliveryCount + 1
      }
    });

    // Socket.io ile broadcast et
    const io = req.app.get('io');
    io.emit('delivery-completed', {
      userId: req.user.id,
      userName: req.user.name,
      deliveryCount: updatedSession.deliveryCount,
      timestamp: new Date()
    });

    // Stats güncelleme de gönder
    io.emit('stats-update', {
      userId: req.user.id,
      userName: req.user.name,
      stats: {
        totalDistance: updatedSession.totalDistance.toFixed(2),
        totalDuration: updatedSession.totalDuration,
        deliveryCount: updatedSession.deliveryCount
      }
    });

    console.log(`✅ Teslimat tamamlandı: ${req.user.name} - Toplam: ${updatedSession.deliveryCount}`);

    res.json({
      success: true,
      message: '📦 Teslimat tamamlandı!',
      data: {
        deliveryCount: updatedSession.deliveryCount
      }
    });

  } catch (error) {
    console.error('❌ Delivery complete error:', error);
    res.status(500).json({
      success: false,
      message: 'Teslimat kaydedilemedi!',
      error: error.message
    });
  }
});

module.exports = router;
