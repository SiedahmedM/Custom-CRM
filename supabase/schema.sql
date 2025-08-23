-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create enum types
CREATE TYPE user_role AS ENUM ('admin', 'driver');
CREATE TYPE order_status AS ENUM ('pending', 'assigned', 'needs_reassignment', 'out_for_delivery', 'delivered', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'check', 'card', 'transfer', 'other');
CREATE TYPE pitch_interest_level AS ENUM ('high', 'medium', 'low', 'none');
CREATE TYPE inventory_adjustment_reason AS ENUM ('new_shipment', 'damaged', 'lost', 'manual_count', 'sale', 'return', 'other');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    access_key VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    role user_role NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    current_balance DECIMAL(10, 2) DEFAULT 0.00,
    credit_limit DECIMAL(10, 2),
    notes TEXT,
    assigned_driver_id UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory table
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    part_number VARCHAR(100) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    cost_per_unit DECIMAL(10, 2) NOT NULL,
    selling_price DECIMAL(10, 2) NOT NULL,
    current_quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    reorder_threshold INTEGER DEFAULT 10,
    location VARCHAR(100),
    supplier VARCHAR(255),
    last_restock_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    driver_id UUID REFERENCES users(id),
    status order_status NOT NULL DEFAULT 'pending',
    order_date TIMESTAMPTZ DEFAULT NOW(),
    delivery_date DATE,
    delivery_address TEXT,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(10, 2) DEFAULT 0.00,
    balance_due DECIMAL(10, 2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
    special_instructions TEXT,
    reassignment_reason TEXT,
    delivery_started_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    delivery_latitude DECIMAL(10, 8),
    delivery_longitude DECIMAL(11, 8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order items table
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    inventory_id UUID NOT NULL REFERENCES inventory(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    amount DECIMAL(10, 2) NOT NULL,
    payment_method payment_method NOT NULL,
    payment_date TIMESTAMPTZ DEFAULT NOW(),
    reference_number VARCHAR(100),
    notes TEXT,
    processed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pitch attempts table
CREATE TABLE pitch_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES users(id),
    customer_id UUID REFERENCES customers(id),
    shop_name VARCHAR(255),
    contact_name VARCHAR(100),
    phone VARCHAR(20),
    pitch_date TIMESTAMPTZ DEFAULT NOW(),
    decision_maker_contacted BOOLEAN DEFAULT false,
    interest_level pitch_interest_level,
    follow_up_required BOOLEAN DEFAULT false,
    follow_up_date DATE,
    potential_order_value DECIMAL(10, 2),
    notes TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_verified BOOLEAN DEFAULT false,
    verification_status VARCHAR(20), -- 'verified', 'questionable', 'flagged'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory adjustments table
CREATE TABLE inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id UUID NOT NULL REFERENCES inventory(id),
    adjustment_type VARCHAR(20) NOT NULL, -- 'add' or 'remove'
    quantity INTEGER NOT NULL,
    reason inventory_adjustment_reason NOT NULL,
    notes TEXT,
    adjusted_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Driver locations table for real-time tracking
CREATE TABLE driver_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES users(id),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(6, 2),
    heading DECIMAL(5, 2),
    speed DECIMAL(6, 2),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- System notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50), -- 'order', 'payment', 'inventory', 'system'
    priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    is_read BOOLEAN DEFAULT false,
    related_order_id UUID REFERENCES orders(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity logs table for audit trail
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50), -- 'order', 'customer', 'inventory', etc.
    entity_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_driver_id ON orders(driver_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_order_date ON orders(order_date);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_pitch_attempts_driver_id ON pitch_attempts(driver_id);
CREATE INDEX idx_pitch_attempts_pitch_date ON pitch_attempts(pitch_date);
CREATE INDEX idx_inventory_part_number ON inventory(part_number);
CREATE INDEX idx_driver_locations_driver_id ON driver_locations(driver_id);
CREATE INDEX idx_driver_locations_recorded_at ON driver_locations(recorded_at);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

-- Create functions for automatic updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update customer balance
CREATE OR REPLACE FUNCTION update_customer_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE customers
        SET current_balance = (
            SELECT COALESCE(SUM(o.balance_due), 0)
            FROM orders o
            WHERE o.customer_id = NEW.customer_id
            AND o.status != 'cancelled'
        )
        WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for customer balance updates
CREATE TRIGGER update_customer_balance_on_order
    AFTER INSERT OR UPDATE OF total_amount, paid_amount ON orders
    FOR EACH ROW EXECUTE FUNCTION update_customer_balance();

CREATE TRIGGER update_customer_balance_on_payment
    AFTER INSERT ON payments
    FOR EACH ROW EXECUTE FUNCTION update_customer_balance();

-- Function to update inventory on order
CREATE OR REPLACE FUNCTION update_inventory_on_order()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
        -- Decrease inventory for delivered orders
        UPDATE inventory i
        SET current_quantity = current_quantity - oi.quantity
        FROM order_items oi
        WHERE i.id = oi.inventory_id
        AND oi.order_id = NEW.id;
        
        -- Update reserved quantity
        UPDATE inventory i
        SET reserved_quantity = reserved_quantity - oi.quantity
        FROM order_items oi
        WHERE i.id = oi.inventory_id
        AND oi.order_id = NEW.id;
    ELSIF NEW.status IN ('assigned', 'out_for_delivery') AND (OLD.status IS NULL OR OLD.status = 'pending') THEN
        -- Reserve inventory when order is assigned
        UPDATE inventory i
        SET reserved_quantity = reserved_quantity + oi.quantity
        FROM order_items oi
        WHERE i.id = oi.inventory_id
        AND oi.order_id = NEW.id;
    ELSIF NEW.status = 'cancelled' AND OLD.status IN ('assigned', 'out_for_delivery') THEN
        -- Release reserved inventory on cancellation
        UPDATE inventory i
        SET reserved_quantity = reserved_quantity - oi.quantity
        FROM order_items oi
        WHERE i.id = oi.inventory_id
        AND oi.order_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_inventory_on_order_status
    AFTER UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION update_inventory_on_order();

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number = 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                       LPAD(NEXTVAL('order_number_seq')::TEXT, 4, '0');
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE SEQUENCE order_number_seq START 1;

CREATE TRIGGER generate_order_number_trigger
    BEFORE INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL)
    EXECUTE FUNCTION generate_order_number();

-- Insert initial users
INSERT INTO users (access_key, name, role, phone) VALUES
    ('Adam1234', 'Adam', 'admin', NULL),
    ('Jose5543', 'Jose', 'driver', NULL),
    ('Ramy7821', 'Ramy', 'driver', NULL),
    ('Ryan9456', 'Ryan', 'driver', NULL);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (simplified for development, adjust for production)
CREATE POLICY "Enable all access for authenticated users" ON users
    FOR ALL USING (true);

CREATE POLICY "Enable all access for authenticated users" ON customers
    FOR ALL USING (true);

CREATE POLICY "Enable all access for authenticated users" ON orders
    FOR ALL USING (true);

CREATE POLICY "Enable all access for authenticated users" ON inventory
    FOR ALL USING (true);

CREATE POLICY "Enable all access for authenticated users" ON payments
    FOR ALL USING (true);

CREATE POLICY "Enable all access for authenticated users" ON pitch_attempts
    FOR ALL USING (true);

CREATE POLICY "Enable all access for authenticated users" ON notifications
    FOR ALL USING (true);