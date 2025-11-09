// İstatistik API - Günlük, Haftalık, Aylık, Yıllık
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Aktif session istatistikleri (real-time)
router.get('/current-session/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Aktif session'ı bul
    const activeSession = await prisma.session.findFirst({
      where: {
        userId: userId,
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
      return res.json({
        success: true,
        data: {
          hasActiveSession: false,
          stats: {
            mesai: '00:00:00',
            mesafe: '0.0 km',
            teslimat: '0',
            mola: '0 dk',
          }
        }
      });
    }

    // Süreyi hesapla
    const now = new Date();
    const durationMinutes = Math.floor((now - new Date(activeSession.startTime)) / 60000);
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    const formattedDuration = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;

    // Mola süresini hesapla
    let totalBreakTime = 0;
    if (activeSession.breaks) {
      try {
        const breaks = Array.isArray(activeSession.breaks) 
          ? activeSession.breaks 
          : (typeof activeSession.breaks === 'string' ? JSON.parse(activeSession.breaks) : []);
        breaks.forEach(b => {
          totalBreakTime += b.duration || 0;
        });
      } catch (e) {
        console.error('Break parse error:', e);
      }
    }

    const formatBreak = (minutes) => {
      if (minutes < 60) return `${minutes} dk`;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}:${mins.toString().padStart(2, '0')}:00`;
    };

    res.json({
      success: true,
      data: {
        hasActiveSession: true,
        status: activeSession.status,
        stats: {
          mesai: formattedDuration,
          mesafe: `${activeSession.totalDistance.toFixed(2)} km`,
          teslimat: activeSession.deliveryCount.toString(),
          mola: formatBreak(totalBreakTime),
        }
      }
    });

  } catch (error) {
    console.error('❌ Current session stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Aktif session istatistikleri alınamadı',
      error: error.message
    });
  }
});

// Kullanıcı istatistikleri
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = 'daily' } = req.query; // daily, weekly, monthly, yearly

    // Tarih aralığını hesapla
    const now = new Date();
    let startDate;

    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        // Pazartesi'den başlat (Türkiye formatı)
        const dayOfWeek = now.getDay(); // 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Pazar ise 6 gün geriye git
        const weekStart = now.getDate() - daysFromMonday;
        startDate = new Date(now.getFullYear(), now.getMonth(), weekStart);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    // Session'ları çek
    const sessions = await prisma.session.findMany({
      where: {
        userId: userId,
        startTime: {
          gte: startDate,
        },
      },
      orderBy: {
        startTime: 'desc',
      },
    });

    // İstatistikleri hesapla
    let totalDuration = 0; // dakika
    let totalDistance = 0; // km
    let totalDeliveries = 0;
    let totalBreakTime = 0; // dakika
    let maxSpeed = 0;
    let longestSession = 0;

    sessions.forEach(session => {
      // Süre hesaplama
      if (session.endTime) {
        const duration = Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 60000);
        totalDuration += duration;
        if (duration > longestSession) longestSession = duration;
      } else if (session.status === 'ACTIVE' || session.status === 'ON_BREAK') {
        // Devam eden session
        const duration = Math.floor((now - new Date(session.startTime)) / 60000);
        totalDuration += duration;
        if (duration > longestSession) longestSession = duration;
      }

      totalDistance += session.totalDistance || 0;
      totalDeliveries += session.deliveryCount || 0;

      // Mola süreleri
      if (session.breaks) {
        try {
          const breaks = Array.isArray(session.breaks) 
            ? session.breaks 
            : (typeof session.breaks === 'string' ? JSON.parse(session.breaks) : []);
          breaks.forEach(b => {
            totalBreakTime += b.duration || 0;
          });
        } catch (e) {
          console.error('Break parse error:', e);
          // Hata olursa skip et
        }
      }
    });

    // Ortalama hız hesapla (km/h)
    const avgSpeed = totalDuration > 0 ? (totalDistance / (totalDuration / 60)).toFixed(1) : 0;

    // Süreleri formatla
    const formatDuration = (minutes) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
    };

    const formatBreak = (minutes) => {
      if (minutes < 60) return `${minutes} dk`;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}:${mins.toString().padStart(2, '0')}:00`;
    };

    // Trend hesaplama (önceki periyotla karşılaştırma)
    let prevStartDate;
    const periodDuration = now - startDate;
    prevStartDate = new Date(startDate.getTime() - periodDuration);

    const prevSessions = await prisma.session.findMany({
      where: {
        userId: userId,
        startTime: {
          gte: prevStartDate,
          lt: startDate,
        },
      },
    });

    let prevTotalDuration = 0;
    prevSessions.forEach(session => {
      if (session.endTime) {
        prevTotalDuration += Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 60000);
      }
    });

    const trend = prevTotalDuration > 0 
      ? ((totalDuration - prevTotalDuration) / prevTotalDuration * 100).toFixed(0)
      : totalDuration > 0 ? '+100' : '0';

    const trendStr = trend > 0 ? `+${trend}%` : trend < 0 ? `${trend}%` : '-';

    res.json({
      success: true,
      data: {
        period,
        stats: {
          mesai: formatDuration(totalDuration),
          mesafe: `${totalDistance.toFixed(1)} km`,
          teslimat: totalDeliveries.toString(),
          mola: formatBreak(totalBreakTime),
          trend: trendStr,
        },
        details: {
          avgSpeed: `${avgSpeed} km/h`,
          longestSession: formatDuration(longestSession),
          efficiency: totalDuration > 0 ? Math.min(100, Math.floor((totalDuration - totalBreakTime) / totalDuration * 100)) : 0,
        },
      },
    });
  } catch (error) {
    console.error('❌ Stats API error:', error);
    res.status(500).json({
      success: false,
      message: 'İstatistikler yüklenirken hata oluştu',
      error: error.message,
    });
  }
});

// Tüm kuryelerin özet istatistikleri (admin için)
router.get('/all', async (req, res) => {
  try {
    const { period = 'daily' } = req.query;

    const now = new Date();
    let startDate;

    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        // Pazartesi'den başlat (Türkiye formatı)
        const dayOfWeek = now.getDay(); // 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Pazar ise 6 gün geriye git
        const weekStart = now.getDate() - daysFromMonday;
        startDate = new Date(now.getFullYear(), now.getMonth(), weekStart);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const sessions = await prisma.session.findMany({
      where: {
        startTime: {
          gte: startDate,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const courierStats = {};

    sessions.forEach(session => {
      const userId = session.userId;
      if (!courierStats[userId]) {
        courierStats[userId] = {
          name: session.user.name,
          email: session.user.email,
          totalDuration: 0,
          totalDistance: 0,
          totalDeliveries: 0,
        };
      }

      if (session.endTime) {
        courierStats[userId].totalDuration += Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 60000);
      } else if (session.status === 'ACTIVE' || session.status === 'ON_BREAK') {
        courierStats[userId].totalDuration += Math.floor((now - new Date(session.startTime)) / 60000);
      }

      courierStats[userId].totalDistance += session.totalDistance || 0;
      courierStats[userId].totalDeliveries += session.deliveryCount || 0;
    });

    res.json({
      success: true,
      data: Object.values(courierStats),
    });
  } catch (error) {
    console.error('❌ All stats API error:', error);
    res.status(500).json({
      success: false,
      message: 'İstatistikler yüklenirken hata oluştu',
      error: error.message,
    });
  }
});

module.exports = router;
