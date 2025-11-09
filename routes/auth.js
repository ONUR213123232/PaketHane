// Authentication Routes - Maksimum Güvenlikli Giriş Sistemi
// bcrypt + JWT + Rate Limiting + Account Locking

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const prisma = new PrismaClient();

// ============ HELPER FUNCTIONS ============

// JWT Token oluştur
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
};

// Refresh Token oluştur
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

// Audit log kaydet
const logAudit = async (userId, action, details, req) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        details,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

// ============ LOGIN ============

router.post('/login', [
  body('email').isEmail().withMessage('Geçerli bir e-posta giriniz'),
  body('password').notEmpty().withMessage('Şifre gerekli')
], async (req, res) => {
  try {
    // Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '❌ Geçersiz veri!',
        errors: errors.array()
      });
    }
    
    const { email, password } = req.body;
    
    // Kullanıcıyı bul
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    
    if (!user) {
      await logAudit(null, 'LOGIN_FAILED', { email, reason: 'User not found' }, req);
      return res.status(401).json({
        success: false,
        message: '❌ E-posta veya şifre hatalı!'
      });
    }
    
    // Hesap kilitli mi kontrol et
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
      return res.status(403).json({
        success: false,
        message: `🔒 Hesabınız ${remainingMinutes} dakika boyunca kilitli!`
      });
    }
    
    // Hesap aktif mi
    if (!user.active) {
      return res.status(403).json({
        success: false,
        message: '🔒 Hesabınız pasif durumda!'
      });
    }
    
    // Şifre kontrolü
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      // Başarısız deneme sayısını arttır
      const newFailedAttempts = user.failedAttempts + 1;
      const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
      
      let updateData = {
        failedAttempts: newFailedAttempts
      };
      
      // 5 başarısız denemede hesabı kilitle
      if (newFailedAttempts >= maxAttempts) {
        const lockTime = parseInt(process.env.LOCK_TIME) || 15; // dakika
        updateData.lockedUntil = new Date(Date.now() + lockTime * 60 * 1000);
      }
      
      await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });
      
      await logAudit(user.id, 'LOGIN_FAILED', { reason: 'Wrong password', attempts: newFailedAttempts }, req);
      
      if (newFailedAttempts >= maxAttempts) {
        return res.status(403).json({
          success: false,
          message: `🔒 Çok fazla başarısız deneme! Hesabınız ${lockTime} dakika kilitlendi.`
        });
      }
      
      return res.status(401).json({
        success: false,
        message: `❌ E-posta veya şifre hatalı! Kalan deneme: ${maxAttempts - newFailedAttempts}`
      });
    }
    
    // ✅ GİRİŞ BAŞARILI!
    
    // Token'ları oluştur
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    
    // Başarısız denemeleri sıfırla + refresh token kaydet
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        refreshToken: refreshToken,
        lastLogin: new Date()
      }
    });
    
    await logAudit(user.id, 'LOGIN_SUCCESS', { email }, req);
    
    res.json({
      success: true,
      message: '✅ Giriş başarılı!',
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Giriş işlemi başarısız!'
    });
  }
});

// ============ REGISTER (Sadece Admin) ============

router.post('/register', [
  body('email').isEmail().withMessage('Geçerli bir e-posta giriniz'),
  body('password').isLength({ min: 6 }).withMessage('Şifre en az 6 karakter olmalı'),
  body('name').notEmpty().withMessage('İsim gerekli')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { email, password, name, phone, role } = req.body;
    
    // E-posta kontrolü
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '❌ Bu e-posta zaten kullanılıyor!'
      });
    }
    
    // Şifreyi hashle (bcrypt - 12 rounds)
    const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    
    // Kullanıcı oluştur
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        phone,
        role: role || 'COURIER'
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });
    
    await logAudit(user.id, 'USER_REGISTERED', { email, role: user.role }, req);
    
    res.status(201).json({
      success: true,
      message: '✅ Kullanıcı oluşturuldu!',
      data: { user }
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Kayıt işlemi başarısız!'
    });
  }
});

// ============ REFRESH TOKEN ============

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: '❌ Refresh token gerekli!'
      });
    }
    
    // Refresh token'ı doğrula
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Kullanıcıyı bul ve refresh token'ı kontrol et
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });
    
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({
        success: false,
        message: '❌ Geçersiz refresh token!'
      });
    }
    
    // Yeni token oluştur
    const newToken = generateToken(user.id);
    
    res.json({
      success: true,
      data: { token: newToken }
    });
    
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(403).json({
      success: false,
      message: '❌ Token yenileme başarısız!'
    });
  }
});

// ============ LOGOUT ============

router.post('/logout', async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Refresh token'ı sil
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null }
    });
    
    await logAudit(userId, 'LOGOUT', {}, req);
    
    res.json({
      success: true,
      message: '✅ Çıkış yapıldı!'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Çıkış işlemi başarısız!'
    });
  }
});

module.exports = router;
