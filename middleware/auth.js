// Authentication Middleware - JWT Token Doğrulama
// Maksimum Güvenlik

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ============ JWT TOKEN DOĞRULAMA ============

const authenticateToken = async (req, res, next) => {
  try {
    // Token'ı header'dan al
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '🔒 Token bulunamadı! Lütfen giriş yapın.'
      });
    }
    
    // Token'ı doğrula
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Kullanıcıyı veritabanından kontrol et
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        lockedUntil: true
      }
    });
    
    if (!user) {
      return res.status(403).json({
        success: false,
        message: '❌ Kullanıcı bulunamadı!'
      });
    }
    
    // Aktif mi kontrol et
    if (!user.active) {
      return res.status(403).json({
        success: false,
        message: '🔒 Hesabınız pasif durumda!'
      });
    }
    
    // Kilitli mi kontrol et
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return res.status(403).json({
        success: false,
        message: '🔒 Hesabınız geçici olarak kilitlendi!'
      });
    }
    
    // Kullanıcı bilgilerini request'e ekle
    req.user = user;
    next();
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '⏰ Token süresi doldu! Lütfen tekrar giriş yapın.'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        success: false,
        message: '❌ Geçersiz token!'
      });
    }
    
    console.error('Auth error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Doğrulama hatası!'
    });
  }
};

// ============ ADMIN KONTROLÜ ============

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: '🚫 Bu işlem için admin yetkisi gerekli!'
    });
  }
  next();
};

// ============ COURIER KONTROLÜ ============

const requireCourier = (req, res, next) => {
  if (req.user.role !== 'COURIER' && req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: '🚫 Bu işlem için kurye yetkisi gerekli!'
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireCourier
};
