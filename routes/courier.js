// Courier Routes - Kurye Yönetimi (Admin için)

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { requireAdmin } = require('../middleware/auth');

const prisma = new PrismaClient();

// ============ TÜM KURYELER (AKTİF + OFFLİNE) ============

router.get('/active', async (req, res) => {
  try {
    // Tüm kuryeleri al
    const allCouriers = await prisma.user.findMany({
      where: {
        role: 'COURIER'
      },
      include: {
        locations: {
          orderBy: { timestamp: 'desc' },
          take: 1 // Son konum
        },
        sessions: {
          where: {
            status: { in: ['ACTIVE', 'ON_BREAK'] }
          },
          orderBy: {
            startTime: 'desc'
          },
          take: 1
        }
      }
    });
    
    console.log(`📊 ${allCouriers.length} kurye bulundu`);
    
    // Kuryeleri formatla
    const courierData = allCouriers.map(courier => {
      const activeSession = courier.sessions[0] || null;
      const lastLocation = courier.locations[0] || null;
      
      let status = 'OFFLINE';
      let isWorking = false;
      
      if (activeSession) {
        isWorking = true;
        status = activeSession.status === 'ON_BREAK' ? 'MOLA' : 'ÇALIŞIYOR';
      }
      
      console.log(`👤 ${courier.name} - Status: ${status}, Location: ${lastLocation ? 'VAR' : 'YOK'}`);
      
      return {
        id: courier.id,
        name: courier.name,
        email: courier.email,
        phone: courier.phone,
        lastLocation: lastLocation,
        activeSession: activeSession ? {
          id: activeSession.id,
          startTime: activeSession.startTime,
          status: activeSession.status,
          totalDistance: activeSession.totalDistance,
          totalDuration: activeSession.totalDuration
        } : null,
        isWorking: isWorking,
        status: status
      };
    });
    
    res.json({
      success: true,
      data: {
        count: courierData.length,
        couriers: courierData
      }
    });
    
  } catch (error) {
    console.error('Get couriers error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Kuryeler alınamadı!'
    });
  }
});

// ============ TÜM KURYELER (Admin) ============

router.get('/all', requireAdmin, async (req, res) => {
  try {
    const couriers = await prisma.user.findMany({
      where: { role: 'COURIER' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        createdAt: true,
        lastLogin: true
      },
      orderBy: { name: 'asc' }
    });
    
    res.json({
      success: true,
      data: {
        count: couriers.length,
        couriers
      }
    });
    
  } catch (error) {
    console.error('Get all couriers error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Kuryeler alınamadı!'
    });
  }
});

// ============ KURYE DETAYI ============

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const courier = await prisma.user.findUnique({
      where: { id },
      include: {
        locations: {
          orderBy: { timestamp: 'desc' },
          take: 10
        },
        sessions: {
          orderBy: { startTime: 'desc' },
          take: 10
        }
      }
    });
    
    if (!courier) {
      return res.status(404).json({
        success: false,
        message: '❌ Kurye bulunamadı!'
      });
    }
    
    // İstatistikler
    const completedSessions = await prisma.session.findMany({
      where: {
        userId: id,
        status: 'COMPLETED'
      }
    });
    
    const stats = {
      totalSessions: completedSessions.length,
      totalDuration: completedSessions.reduce((sum, s) => sum + s.totalDuration, 0),
      totalDistance: completedSessions.reduce((sum, s) => sum + s.totalDistance, 0),
      avgDuration: completedSessions.length > 0
        ? Math.round(completedSessions.reduce((sum, s) => sum + s.totalDuration, 0) / completedSessions.length)
        : 0
    };
    
    res.json({
      success: true,
      data: {
        courier: {
          id: courier.id,
          name: courier.name,
          email: courier.email,
          phone: courier.phone,
          active: courier.active,
          createdAt: courier.createdAt,
          lastLogin: courier.lastLogin
        },
        recentLocations: courier.locations,
        recentSessions: courier.sessions,
        stats
      }
    });
    
  } catch (error) {
    console.error('Get courier detail error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Kurye detayı alınamadı!'
    });
  }
});

// ============ KURYE AKTİF/PASİF YAP (Admin) ============

router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;
    
    const courier = await prisma.user.update({
      where: { id },
      data: { active },
      select: {
        id: true,
        name: true,
        active: true
      }
    });
    
    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'COURIER_STATUS_CHANGED',
        details: {
          courierId: id,
          newStatus: active
        }
      }
    });
    
    res.json({
      success: true,
      message: `✅ Kurye ${active ? 'aktif' : 'pasif'} yapıldı!`,
      data: { courier }
    });
    
  } catch (error) {
    console.error('Update courier status error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Kurye durumu güncellenemedi!'
    });
  }
});

// ============ DASHBOARD İSTATİSTİKLERİ (Admin) ============

router.get('/stats/dashboard', requireAdmin, async (req, res) => {
  try {
    // Aktif kuryeler
    const activeCouriers = await prisma.user.count({
      where: {
        role: 'COURIER',
        active: true
      }
    });
    
    // Şu an çalışan kuryeler
    const workingCouriers = await prisma.session.count({
      where: {
        status: { in: ['ACTIVE', 'ON_BREAK'] }
      }
    });
    
    // Bugünkü toplam mesai
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySessions = await prisma.session.findMany({
      where: {
        startTime: { gte: today }
      }
    });
    
    const todayStats = {
      sessions: todaySessions.length,
      totalDuration: todaySessions.reduce((sum, s) => sum + (s.totalDuration || 0), 0),
      totalDistance: todaySessions.reduce((sum, s) => sum + (s.totalDistance || 0), 0)
    };
    
    // Son 7 gün istatistikleri
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const weekSessions = await prisma.session.findMany({
      where: {
        startTime: { gte: weekAgo },
        status: 'COMPLETED'
      }
    });
    
    const weekStats = {
      sessions: weekSessions.length,
      totalDuration: weekSessions.reduce((sum, s) => sum + s.totalDuration, 0),
      totalDistance: weekSessions.reduce((sum, s) => sum + s.totalDistance, 0)
    };
    
    res.json({
      success: true,
      data: {
        activeCouriers,
        workingCouriers,
        today: todayStats,
        week: weekStats
      }
    });
    
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: '❌ İstatistikler alınamadı!'
    });
  }
});

module.exports = router;
