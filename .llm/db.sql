-- ===========================================
--  创建数据库
-- ===========================================
CREATE DATABASE tronclass
    WITH
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

\c tronclass;

-- ===========================================
--  用户表 users
-- ===========================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    is_auto BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：按名字快速查找
CREATE INDEX idx_users_name ON users(name);


-- ===========================================
--  Cookie 表 cookies
-- ===========================================
CREATE TABLE IF NOT EXISTS cookies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：按用户查询最近 cookie
CREATE INDEX idx_cookies_user_id ON cookies(user_id);


-- ===========================================
--  扫码历史表 scan_history
-- ===========================================
CREATE TABLE IF NOT EXISTS scan_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：按时间和用户查询
CREATE INDEX idx_scan_history_created_at ON scan_history(created_at DESC);
CREATE INDEX idx_scan_history_user_id ON scan_history(user_id);


-- ===========================================
--  签到历史表 signin_history
-- ===========================================
CREATE TABLE IF NOT EXISTS signin_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cookie TEXT,
    scan_history_id UUID REFERENCES scan_history(id) ON DELETE SET NULL,
    request_data JSONB,
    response_code INT,
    response_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：按时间与用户快速查询
CREATE INDEX idx_signin_history_created_at ON signin_history(created_at DESC);
CREATE INDEX idx_signin_history_user_id ON signin_history(user_id);

-- ===========================================
--  视图（方便接口查询）
-- ===========================================

-- 获取带有最新 cookie 的用户（UserWithCookie）
CREATE OR REPLACE VIEW user_with_cookie AS
SELECT
    u.id,
    u.name,
    u.is_auto,
    c.value AS latest_cookie,
    c.expires
FROM users u
LEFT JOIN LATERAL (
    SELECT value, expires
    FROM cookies
    WHERE cookies.user_id = u.id
    ORDER BY created_at DESC
    LIMIT 1
) c ON TRUE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'log_action') THEN
        CREATE TYPE log_action AS ENUM (
            'USER_ADD',
            'USER_REMOVE',
            'USER_RENAME',
            'USER_REFRESH_COOKIE',
            'USER_SET_AUTO',
            'SCAN_SIGNIN',
            'SIGNIN_AUTO',
            'OTHER'
        );
    END IF;
END$$;

-- 创建日志表
CREATE TABLE IF NOT EXISTS log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action log_action NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===========================================
-- 完成
-- ===========================================
