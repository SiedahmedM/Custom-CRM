# 🚗 Muffler Parts CRM - Production-Ready PWA

## Overview

A **bulletproof, real-time CRM system** specifically designed for muffler parts businesses. Built with Next.js 15, Supabase, and optimized for iOS devices as a Progressive Web App (PWA).

### 🔥 Key Features

- **Real-time Everything**: Order updates, inventory changes, and customer balances sync instantly across all devices (<2 seconds)
- **iOS-First Design**: Native-like experience when added to iPhone home screen
- **Offline Support**: Works without internet, syncs when reconnected
- **Role-Based Access**: Admin dashboard + Driver mobile interface
- **Live GPS Tracking**: Real-time driver location and delivery verification
- **Customer Balance Management**: Automatic balance calculations with payment tracking
- **Pitch Tracking**: Sales performance monitoring with GPS verification
- **Inventory Management**: Real-time stock levels with low-stock alerts

## 🚀 Quick Start Guide

### 1. Prerequisites

- Node.js 18+ installed
- A Supabase account (free tier works)
- Git

### 2. Project Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd muffler-crm

# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local
```

### 3. Supabase Setup

#### Create a New Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project" → "New project"
3. Choose organization and create project
4. Wait for project to be ready (~2 minutes)

#### Get Your Supabase Credentials

1. Go to Settings → API
2. Copy your Project URL and anon public key
3. Update `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

#### Setup Database Schema

1. In Supabase dashboard, go to SQL Editor
2. Copy the entire contents of `supabase/schema.sql`
3. Paste and run the SQL (this creates all tables, functions, and triggers)
4. Verify tables were created in Table Editor

#### Enable Real-time

1. Go to Database → Replication
2. Enable replication for these tables:
   - `orders`
   - `inventory`
   - `customers`
   - `payments`
   - `pitch_attempts`
   - `notifications`

### 4. Run the Application

```bash
# Start development server
npm run dev

# Open in browser
open http://localhost:3000
```

### 5. Test Login

Use these demo credentials:

- **Admin**: `Adam1234`
- **Drivers**: `Jose5543`, `Ramy7821`, `Ryan9456`

## 📱 iOS Installation Guide

### For End Users (iPhone)

1. **Open Safari** and navigate to your deployed URL
2. **Tap the Share button** (square with arrow up)
3. **Scroll down** and tap "Add to Home Screen"
4. **Tap "Add"** to confirm
5. **Launch from home screen** for native app experience

### Features When Installed on iOS

- ✅ Full-screen app (no Safari UI)
- ✅ Offline functionality
- ✅ Push notifications (when configured)
- ✅ iOS-style interactions and animations
- ✅ Safe area handling for iPhone notch/island
- ✅ Prevents accidental zoom on input focus
- ✅ Native scrolling momentum

## 🏗️ Production Deployment

### Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### Deploy to Netlify

```bash
# Build the project
npm run build

# Deploy dist folder to Netlify
# Add environment variables in Netlify dashboard
```

### Environment Variables for Production

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_production_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# App Configuration
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_APP_NAME="Muffler Parts CRM"
NEXT_PUBLIC_COMPANY_NAME="Your Company Name"

# Optional: Google Maps (for enhanced location features)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_key

# Real-time Configuration
NEXT_PUBLIC_REALTIME_HEARTBEAT_INTERVAL=30000
NEXT_PUBLIC_REALTIME_RECONNECT_DELAY=5000
NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS=10
```

## 🔧 Configuration

### Add Custom Users

In Supabase SQL Editor:

```sql
INSERT INTO users (access_key, name, role, phone) VALUES
('YourKey123', 'John Doe', 'driver', '555-0123'),
('AdminKey456', 'Jane Smith', 'admin', '555-0124');
```

### Configure Company Information

Update in `.env.local`:

```env
NEXT_PUBLIC_COMPANY_NAME="Your Muffler Shop"
NEXT_PUBLIC_APP_NAME="Your CRM Name"
```

### Add Initial Inventory

```sql
INSERT INTO inventory (part_number, description, cost_per_unit, selling_price, current_quantity, reorder_threshold)
VALUES 
('CAT-123', 'Catalytic Converter - Toyota Camry', 150.00, 250.00, 10, 3),
('EXH-456', 'Exhaust Pipe - Honda Civic', 75.00, 125.00, 15, 5);
```

### Add Customers

```sql
INSERT INTO customers (shop_name, contact_name, phone, address, city, state, zip_code)
VALUES 
('Joe''s Auto Repair', 'Joe Smith', '555-1234', '123 Main St', 'Anytown', 'ST', '12345'),
('Quick Fix Motors', 'Sarah Johnson', '555-5678', '456 Oak Ave', 'Other City', 'ST', '67890');
```

## 📊 Real-Time Features Configuration

### Supabase Real-Time Setup

The app uses Supabase's real-time features extensively. Ensure these are enabled:

1. **Database → Replication**: Enable for all main tables
2. **Settings → API**: Ensure RLS is configured properly
3. **Authentication**: Set up if you want user-based auth (optional)

### Real-Time Performance

- Order updates propagate in <2 seconds
- Inventory changes reflect immediately
- Customer balance updates are instant
- Driver performance metrics update live
- Connection status monitoring with auto-reconnect

## 🔒 Security Best Practices

### Row Level Security (RLS)

The schema includes basic RLS policies. For production, consider:

```sql
-- Example: Drivers can only see their own orders
CREATE POLICY "Drivers see own orders" ON orders
FOR SELECT USING (driver_id = auth.uid());

-- Example: Only admins can modify inventory
CREATE POLICY "Admin inventory access" ON inventory
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);
```

### API Security

- Environment variables are properly scoped (`NEXT_PUBLIC_` for client-side only)
- Supabase keys are read-only for client operations
- Service role key (if used) should be server-side only

## 🚨 Troubleshooting

### Common Issues

#### "Real-time not working"
- Check Supabase replication is enabled
- Verify WebSocket connection in network tab
- Ensure proper HTTPS in production

#### "PWA not installing on iOS"
- Must be served over HTTPS (localhost works for testing)
- Manifest.json must be valid
- Service worker must register successfully

#### "Database errors"
- Verify schema.sql ran completely
- Check RLS policies aren't blocking operations
- Ensure proper foreign key relationships

### Debug Mode

Add to `.env.local` for debugging:

```env
NEXT_PUBLIC_DEBUG_MODE=true
```

This enables:
- Console logs for real-time events
- Connection status indicators
- Detailed error messages

## 📈 Performance Monitoring

### Built-in Metrics

The app tracks:
- Real-time connection status
- Query performance
- Error rates
- User engagement

### Production Monitoring

Consider adding:
- Sentry for error tracking
- Vercel Analytics for performance
- Supabase metrics for database performance

## 🔄 Updates & Maintenance

### Database Migrations

For schema changes:

1. Create migration file in `supabase/migrations/`
2. Test locally
3. Apply to production via Supabase dashboard

### App Updates

The service worker handles app updates automatically. Users will see update notifications.

### Data Backups

Supabase automatically backs up your data. For additional security:
- Export data regularly via Supabase dashboard
- Consider setting up automated backups

## 📞 Support

For issues with this CRM system:

1. Check this README first
2. Review console logs for errors
3. Verify Supabase configuration
4. Test real-time subscriptions

## 🎯 Production Checklist

Before going live:

- [ ] Supabase project configured with proper limits
- [ ] Environment variables set correctly
- [ ] Real-time replication enabled on all tables
- [ ] HTTPS configured for domain
- [ ] PWA manifest and icons added
- [ ] Service worker registered successfully
- [ ] User access keys generated
- [ ] Initial inventory and customers added
- [ ] Backup strategy implemented
- [ ] Error monitoring configured
- [ ] Performance monitoring enabled

## 🚀 Going Live

1. **Deploy** to your hosting platform
2. **Configure** environment variables
3. **Test** with real devices (iPhones)
4. **Train** users on PWA installation
5. **Monitor** real-time performance
6. **Scale** Supabase plan as needed

---

**🎉 Your production-ready, real-time muffler parts CRM is ready to revolutionize your business operations!**
