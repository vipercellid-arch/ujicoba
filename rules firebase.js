rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // =========================================================
    // FUNGSI CEK ADMIN RESMI VIPERCELL (AKSES PENUH)
    // =========================================================
    function isAdmin() {
      return request.auth != null && (
        request.auth.token.email == "vipercell.id@gmail.com" || 
        request.auth.token.email == "millertipak63@gmail.com" ||
        request.auth.token.email == "vipercell@bot.id"
      );
    }

    // =========================================================
    // 1. KOLEKSI USERS (MEMBER & TAMU ANONIM + UPGRADE AKUN)
    // =========================================================
    match /users/{userId} {
      allow read, create, update: if true;
      allow delete: if isAdmin() || request.auth != null;
    }

    // =========================================================
    // 2. KOLEKSI ORDERS (PESANAN & VALIDASI QRIS OTOMATIS v27.9 DIRECT FIREBASE)
    //    Mendukung perubahan status UNPAID -> PAID -> SUCCESS / PENDING
    //    langsung dari Database Firebase & Auto-Delivery Web (Tanpa Apps Script)
    // =========================================================
    match /orders/{orderId} {
      allow read, create: if true;
      allow update: if isAdmin() || (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'status',
          'paymentVerified',
          'paidAt',
          'paidAtIso',
          'paymentVerifiedBy',
          'paymentMutationId',
          'paymentApp',
          'adminReply',
          'autoDelivered',
          'deliveredAt',
          'durationDays',
          'subscriptionStartAt',
          'subscriptionEndAt',
          'subscriptionStatus',
          'userId',
          'userEmail',
          'emailSent',
          'emailSending',
          'emailSentAt',
          'notif_new',
          'notif_paid',
          'notif_completed'
        ])
      );
      allow delete: if isAdmin();
    }

    // =========================================================
    // 3. KOLEKSI STOCKS (GUDANG STOK LOKAL OTOMATIS 24 JAM)
    //    - Read diizinkan agar Web User tahu ketersediaan stok lokal
    //      saat di luar jam layanan Admin & bisa auto-deliver instan.
    //    - Create & Delete hanya untuk Admin.
    //    - Update kuota terpakai diizinkan saat pesanan lunas.
    // =========================================================
    match /stocks/{stockId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'usedQuota',
          'status',
          'usedAt',
          'orderId',
          'buyers',
          'sentCount',
          'lastSentAt',
          'lastOrderId'
        ])
      );
    }

    // =========================================================
    // 4. KOLEKSI PRODUCTS (KATALOG PRODUK & SINKRONISASI STOK)
    // =========================================================
    match /products/{productId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'stockVault',
          'exhaustedVault',
          'stockCount',
          'soldOut'
        ])
      );
    }

    // =========================================================
    // 5. KOLEKSI PROMOS (KODE PROMO MEMBER)
    // =========================================================
    match /promos/{promoId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'usedCount',
          'usedEmails'
        ])
      );
    }

    // =========================================================
    // 6. KOLEKSI SETTINGS (KONFIGURASI TOKO & SINYAL PEMBAYARAN)
    // =========================================================
    match /settings/{settingId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'lastPaymentDetected',
          'lastPaymentTimestamp',
          'lastPaymentMutation',
          'suggestionsList',
          'footerMarqueeShowPrice',
          'footerMarqueeShowStatus',
          'footerMarqueeSpeed'
        ])
      );
    }

    // =========================================================
    // 7. KOLEKSI PAYMENT_MUTATIONS (MUTASI QRIS DARI MACRODROID)
    // =========================================================
    match /payment_mutations/{mutationId} {
      allow read, create, update: if true;
      allow delete: if isAdmin();
    }

    // =========================================================
    // 8. KOLEKSI PRODUCT_SUGGESTIONS (SARAN PRODUK BARU)
    // =========================================================
    match /product_suggestions/{suggestionId} {
      allow read, create: if true;
      allow update, delete: if isAdmin();
    }

    // =========================================================
    // 9. KOLEKSI DEVICE_LOCKS (KEAMANAN PERANGKAT & SESI TAMU)
    // =========================================================
    match /device_locks/{deviceId} {
      allow read, create, update: if true;
      allow delete: if isAdmin() || request.auth != null;
    }

    // =========================================================
    // 10. KOLEKSI REVIEWS & CHATS (ULASAN & LIVE CHAT BANTUAN)
    // =========================================================
    match /reviews/{reviewId} {
      allow read, create: if true;
      allow update, delete: if isAdmin();
    }

    match /chats/{userId} {
      allow read, create, update: if true;
      allow delete: if isAdmin() || request.auth != null;
    }

    // =========================================================
    // RULES WORKSPACE / ARTIFACTS PATH (CADANGAN KOMPATIBILITAS)
    // =========================================================
    match /artifacts/{appId}/public/data/users/{userId} {
      allow read, create, update: if true;
      allow delete: if isAdmin() || request.auth != null;
    }
    match /artifacts/{appId}/public/data/orders/{orderId} {
      allow read, create: if true;
      allow update: if isAdmin() || (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'status', 'paymentVerified', 'paidAt', 'paidAtIso',
          'paymentVerifiedBy', 'paymentMutationId', 'paymentApp',
          'adminReply', 'autoDelivered', 'deliveredAt',
          'durationDays', 'subscriptionStartAt', 'subscriptionEndAt', 'subscriptionStatus',
          'userId', 'userEmail', 'emailSent', 'emailSending', 'emailSentAt',
          'notif_new', 'notif_paid', 'notif_completed'
        ])
      );
      allow delete: if isAdmin();
    }
    match /artifacts/{appId}/public/data/stocks/{stockId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'usedQuota', 'status', 'usedAt', 'orderId', 'buyers', 'sentCount', 'lastSentAt', 'lastOrderId'
        ])
      );
    }
    match /artifacts/{appId}/public/data/products/{productId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'stockVault', 'exhaustedVault', 'stockCount', 'soldOut'
        ])
      );
    }
    match /artifacts/{appId}/public/data/promos/{promoId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'usedCount', 'usedEmails'
        ])
      );
    }
    match /artifacts/{appId}/public/data/settings/{settingId} {
      allow read: if true;
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || (
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'lastPaymentDetected', 'lastPaymentTimestamp', 'lastPaymentMutation', 'suggestionsList', 'footerMarqueeShowPrice', 'footerMarqueeShowStatus', 'footerMarqueeSpeed'
        ])
      );
    }
    match /artifacts/{appId}/public/data/payment_mutations/{mutationId} {
      allow read, create, update: if true;
      allow delete: if isAdmin();
    }
    match /artifacts/{appId}/public/data/product_suggestions/{suggestionId} {
      allow read, create: if true;
      allow update, delete: if isAdmin();
    }
    match /artifacts/{appId}/public/data/device_locks/{deviceId} {
      allow read, create, update: if true;
      allow delete: if isAdmin() || request.auth != null;
    }
    match /artifacts/{appId}/public/data/reviews/{reviewId} {
      allow read, create: if true;
      allow update, delete: if isAdmin();
    }
    match /artifacts/{appId}/public/data/chats/{userId} {
      allow read, create, update: if true;
      allow delete: if isAdmin() || request.auth != null;
    }
  }
}