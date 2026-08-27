-- =====================================================================
-- KAROFI SALES FORECAST APP - DATABASE SCHEMA (PostgreSQL 14+)
-- Nguon: thiet ke lai tu file "XK_OEM_GT2_Online_Sales_FC_2026.xlsx"
-- Muc dich: quan ly ke hoach kinh doanh theo don vi, SKU, thang, tuan, mien
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- cho gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1. DANH MUC (reference / master data)
-- ---------------------------------------------------------------------

-- Don vi kinh doanh: MT, XK, OEM, GT2, MLT, Retail, Online, GT1...
CREATE TABLE business_units (
    code            VARCHAR(20)  PRIMARY KEY,          -- vd: 'GT2', 'OEM'
    name            VARCHAR(100) NOT NULL,              -- vd: 'Kenh GT2'
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Mien / vung ban hang
CREATE TABLE regions (
    code            VARCHAR(10)  PRIMARY KEY,           -- 'MB', 'MN'
    name            VARCHAR(50)  NOT NULL,               -- 'Mien Bac'
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Doi tac phan phoi / doc quyen (BHT, Nasaco, Quoc Te, Vu Tru, 3T...)
CREATE TABLE partners (
    id              SERIAL       PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Nhom san pham (NHOM 1..5: May TCM sx, May nhap khau, Mockup, Loi, Mang)
CREATE TABLE product_groups (
    code            VARCHAR(20)  PRIMARY KEY,           -- 'NHOM_1'
    name            VARCHAR(100) NOT NULL
);

-- Danh muc SKU - NGUON DUY NHAT, khong lap lai giua cac sheet don vi
CREATE TABLE products (
    sku_code        VARCHAR(30)  PRIMARY KEY,           -- Ma san pham, vd '1001040857'
    name            VARCHAR(255) NOT NULL,               -- Ten san pham
    short_name      VARCHAR(100),                        -- Model / ten goi tat
    product_group_code VARCHAR(20) REFERENCES product_groups(code),
    technology      VARCHAR(100),                        -- Cong nghe chinh
    default_channel VARCHAR(20)  REFERENCES business_units(code),
                                                          -- Kenh mac dinh cua SKU (co the override o forecast_cycle)
    partner_id      INTEGER      REFERENCES partners(id),-- Doc quyen (neu co)
    avg_price       NUMERIC(18,2),                       -- Gia ban binh quan / gia ghi nhan DT
    is_finished_good BOOLEAN     NOT NULL DEFAULT TRUE,   -- FALSE = linh kien/vat tu, de loc bot khi nhap FC
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_group ON products(product_group_code);
CREATE INDEX idx_products_channel ON products(default_channel);

-- Nguoi dung app
CREATE TABLE users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    role            VARCHAR(20)  NOT NULL
                    CHECK (role IN ('bu_editor','bu_approver','central_admin','viewer')),
    business_unit_code VARCHAR(20) REFERENCES business_units(code),
                                                          -- NULL neu la central_admin (xem duoc moi don vi)
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. CHU KY LAP KE HOACH (forecast cycle & version)
-- ---------------------------------------------------------------------

-- Mot "chu ky FC 4 thang" cua mot don vi kinh doanh, bat dau tu base_month
CREATE TABLE forecast_cycles (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_unit_code  VARCHAR(20) NOT NULL REFERENCES business_units(code),
    base_month          DATE        NOT NULL,   -- ngay 01 cua thang dau tien trong 4 thang FC
    horizon_months      SMALLINT    NOT NULL DEFAULT 4 CHECK (horizon_months > 0),
    status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','submitted','approved','rejected','locked')),
    created_by          UUID        REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_unit_code, base_month)   -- moi don vi chi co 1 cycle cho 1 base_month
);
CREATE INDEX idx_cycles_bu_status ON forecast_cycles(business_unit_code, status);

-- Moi lan don vi cap nhat/xac nhan lai trong tuan = 1 version moi
-- (tuong ung "Tuan 0", "Tuan 1"... trong file goc). Cho phep tinh
-- chenh lech giua cac tuan bang query thay vi cot cung.
CREATE TABLE forecast_versions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id        UUID        NOT NULL REFERENCES forecast_cycles(id) ON DELETE CASCADE,
    update_week     SMALLINT    NOT NULL CHECK (update_week >= 0),  -- 0,1,2,3...
    update_date     DATE        NOT NULL,
    iso_week_label  VARCHAR(10),                                    -- vd 'W31' (tuy chon, de hien thi)
    submitted_by    UUID        REFERENCES users(id),
    submitted_at    TIMESTAMPTZ,
    is_final        BOOLEAN     NOT NULL DEFAULT FALSE,  -- version dang duoc dung de tong hop/xuat bao cao
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (cycle_id, update_week)
);
CREATE INDEX idx_versions_cycle ON forecast_versions(cycle_id);
-- Dam bao chi 1 version "is_final = true" tren moi cycle tai 1 thoi diem
CREATE UNIQUE INDEX uq_one_final_version_per_cycle
    ON forecast_versions(cycle_id) WHERE is_final;

-- ---------------------------------------------------------------------
-- 3. DU LIEU FORECAST (dang "long": moi dong = 1 SKU x 1 ky x so luong)
-- ---------------------------------------------------------------------

-- San luong theo SKU cho tung thang trong 4 thang toi
CREATE TABLE monthly_forecast_lines (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id      UUID        NOT NULL REFERENCES forecast_versions(id) ON DELETE CASCADE,
    sku_code        VARCHAR(30) NOT NULL REFERENCES products(sku_code),
    forecast_month  DATE        NOT NULL,          -- ngay 01 cua thang duoc du bao
    quantity        NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    note            VARCHAR(500),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (version_id, sku_code, forecast_month)
);
CREATE INDEX idx_mfl_version ON monthly_forecast_lines(version_id);
CREATE INDEX idx_mfl_sku ON monthly_forecast_lines(sku_code);
CREATE INDEX idx_mfl_month ON monthly_forecast_lines(forecast_month);

-- San luong theo SKU, chia theo tuan va mien - CHI cho thang dau tien cua cycle
CREATE TABLE weekly_region_splits (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id      UUID        NOT NULL REFERENCES forecast_versions(id) ON DELETE CASCADE,
    sku_code        VARCHAR(30) NOT NULL REFERENCES products(sku_code),
    week_number     SMALLINT    NOT NULL CHECK (week_number BETWEEN 1 AND 6),
    region_code     VARCHAR(10) NOT NULL REFERENCES regions(code),
    quantity        NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (version_id, sku_code, week_number, region_code)
);
CREATE INDEX idx_wrs_version ON weekly_region_splits(version_id);
CREATE INDEX idx_wrs_sku ON weekly_region_splits(sku_code);

-- ---------------------------------------------------------------------
-- 4. KET QUA BAN HANG THUC TE (actuals) - du lieu nam truoc / cac thang
--    truoc, dung de DOI CHIEU THAM KHAO khi lap ke hoach va khi tham
--    dinh (approve) ke hoach. Nguon thuong la SAP, nap dinh ky (vd hang
--    dem/hang thang) - KHONG cho user sua tay tren app, chi cho import.
-- ---------------------------------------------------------------------

CREATE TABLE actual_sales_results (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_unit_code  VARCHAR(20) NOT NULL REFERENCES business_units(code),
    sku_code            VARCHAR(30) NOT NULL REFERENCES products(sku_code),
    actual_month        DATE        NOT NULL,   -- ngay 01 cua thang co so lieu thuc te
    region_code         VARCHAR(10) REFERENCES regions(code),
                                                 -- NULL = so lieu khong tach mien (cho phep ca 2 muc do chi tiet)
    quantity            NUMERIC(18,2) NOT NULL DEFAULT 0,
    revenue             NUMERIC(18,2),          -- doanh thu thuc te (tuy chon, neu can doi chieu ca gia tri)
    source_system       VARCHAR(30)  NOT NULL DEFAULT 'SAP'
                        CHECK (source_system IN ('SAP','manual_import','other')),
    imported_by         UUID        REFERENCES users(id),
    imported_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_unit_code, sku_code, actual_month, region_code)
);
CREATE INDEX idx_actuals_bu_month ON actual_sales_results(business_unit_code, actual_month);
CREATE INDEX idx_actuals_sku ON actual_sales_results(sku_code);
CREATE INDEX idx_actuals_month ON actual_sales_results(actual_month);

-- Ghi chu:
--  - 1 dong = 1 SKU x 1 don vi x 1 thang (x 1 mien, neu co tach mien).
--    Cung mot cau truc "long" nhu monthly_forecast_lines/weekly_region_splits
--    nen co the dung CHUNG 1 component/API o tang app de ve bieu do "KH vs TT".
--  - Nap du lieu nhieu nam (vd 24 thang gan nhat) de vua doi chieu cung ky
--    nam truoc (YoY) vua doi chieu cac thang gan day (trend/MoM).
--  - Khong rang buoc actual_month phai trung voi forecast_month nao ca,
--    vi day la du lieu lich su doc lap, dung de JOIN tham chieu khi can.

-- ---------------------------------------------------------------------
-- 5. PHE DUYET (approval workflow)
-- ---------------------------------------------------------------------

CREATE TABLE approvals (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id        UUID        NOT NULL REFERENCES forecast_cycles(id) ON DELETE CASCADE,
    version_id      UUID        NOT NULL REFERENCES forecast_versions(id),
    approver_id     UUID        REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','revision_requested')),
    comment         VARCHAR(1000),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at      TIMESTAMPTZ
);
CREATE INDEX idx_approvals_cycle ON approvals(cycle_id);

-- =====================================================================
-- 6. VIEW TONG HOP - dung de sinh bao cao / xuat form phe duyet
--    (thay the cho cac sheet B0.SUM / B1.SUM lam bang tay truoc day)
-- =====================================================================

-- Tong san luong theo thang, theo don vi kinh doanh, tai version moi nhat cua tung cycle
CREATE OR REPLACE VIEW v_monthly_forecast_summary AS
SELECT
    fc.business_unit_code,
    fc.id                       AS cycle_id,
    fv.id                       AS version_id,
    fv.update_week,
    p.product_group_code,
    mfl.sku_code,
    p.name                      AS product_name,
    mfl.forecast_month,
    mfl.quantity
FROM monthly_forecast_lines mfl
JOIN forecast_versions fv  ON fv.id = mfl.version_id
JOIN forecast_cycles fc    ON fc.id = fv.cycle_id
JOIN products p             ON p.sku_code = mfl.sku_code
WHERE fv.is_final = TRUE;

-- Tong san luong tuan/mien cua thang dau tien, tai version moi nhat
CREATE OR REPLACE VIEW v_weekly_region_summary AS
SELECT
    fc.business_unit_code,
    fc.id                       AS cycle_id,
    fv.id                       AS version_id,
    fv.update_week,
    wrs.sku_code,
    p.name                      AS product_name,
    wrs.week_number,
    wrs.region_code,
    wrs.quantity
FROM weekly_region_splits wrs
JOIN forecast_versions fv  ON fv.id = wrs.version_id
JOIN forecast_cycles fc    ON fc.id = fv.cycle_id
JOIN products p             ON p.sku_code = wrs.sku_code
WHERE fv.is_final = TRUE;

-- Chenh lech FC giua 2 version lien tiep cua cung 1 cycle (thay cho cot
-- "Chenh lech FC tuan N vs tuan N-1" lam tay trong file goc)
CREATE OR REPLACE VIEW v_forecast_variance AS
SELECT
    curr.cycle_id,
    curr.sku_code,
    curr.forecast_month,
    curr.update_week            AS current_week,
    curr.quantity                AS current_qty,
    prev.update_week            AS previous_week,
    prev.quantity                AS previous_qty,
    curr.quantity - COALESCE(prev.quantity, 0) AS variance
FROM (
    SELECT fv.cycle_id, fv.update_week, mfl.sku_code, mfl.forecast_month, mfl.quantity
    FROM monthly_forecast_lines mfl
    JOIN forecast_versions fv ON fv.id = mfl.version_id
) curr
LEFT JOIN (
    SELECT fv.cycle_id, fv.update_week, mfl.sku_code, mfl.forecast_month, mfl.quantity
    FROM monthly_forecast_lines mfl
    JOIN forecast_versions fv ON fv.id = mfl.version_id
) prev
    ON prev.cycle_id = curr.cycle_id
   AND prev.sku_code = curr.sku_code
   AND prev.forecast_month = curr.forecast_month
   AND prev.update_week = curr.update_week - 1;

-- Doi chieu KE HOACH (final version) vs THUC TE cua CHINH THANG DO
-- (dung khi nguoi tham dinh xem KH thang t co hop ly so voi thuc te
-- cac thang gan day hay khong, va khi thang t da co so lieu thuc te)
CREATE OR REPLACE VIEW v_forecast_vs_actual AS
SELECT
    f.business_unit_code,
    f.cycle_id,
    f.sku_code,
    f.product_name,
    f.forecast_month,
    f.quantity                          AS forecast_qty,
    COALESCE(a.actual_qty, 0)           AS actual_qty,
    f.quantity - COALESCE(a.actual_qty, 0)                 AS variance_qty,
    ROUND(COALESCE(a.actual_qty, 0) / NULLIF(f.quantity,0) * 100, 1) AS achievement_pct
FROM v_monthly_forecast_summary f
LEFT JOIN (
    SELECT business_unit_code, sku_code, actual_month, SUM(quantity) AS actual_qty
    FROM actual_sales_results
    GROUP BY business_unit_code, sku_code, actual_month
) a
    ON a.business_unit_code = f.business_unit_code
   AND a.sku_code = f.sku_code
   AND a.actual_month = f.forecast_month;

-- Doi chieu KE HOACH vs THUC TE CUNG KY NAM TRUOC (YoY) - tham khao
-- khi lap ke hoach (vd: KH thang 8/2026 vs thuc te thang 8/2025)
CREATE OR REPLACE VIEW v_forecast_vs_actual_yoy AS
SELECT
    f.business_unit_code,
    f.cycle_id,
    f.sku_code,
    f.product_name,
    f.forecast_month,
    f.quantity                          AS forecast_qty,
    (f.forecast_month - INTERVAL '1 year')::date          AS reference_month,
    COALESCE(a.actual_qty, 0)           AS actual_qty_last_year,
    ROUND(
      (f.quantity - COALESCE(a.actual_qty,0)) / NULLIF(a.actual_qty,0) * 100, 1
    )                                    AS growth_pct_vs_last_year
FROM v_monthly_forecast_summary f
LEFT JOIN (
    SELECT business_unit_code, sku_code, actual_month, SUM(quantity) AS actual_qty
    FROM actual_sales_results
    GROUP BY business_unit_code, sku_code, actual_month
) a
    ON a.business_unit_code = f.business_unit_code
   AND a.sku_code = f.sku_code
   AND a.actual_month = (f.forecast_month - INTERVAL '1 year')::date;

-- Xu huong thuc te 3 thang gan nhat truoc base_month cua cycle - tham
-- khao nhanh khi don vi dang lap ke hoach (chua co thuc te thang do)
CREATE OR REPLACE VIEW v_actual_trailing_3m AS
SELECT
    business_unit_code,
    sku_code,
    actual_month,
    SUM(quantity) AS actual_qty,
    AVG(SUM(quantity)) OVER (
        PARTITION BY business_unit_code, sku_code
        ORDER BY actual_month
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) AS avg_trailing_3m
FROM actual_sales_results
GROUP BY business_unit_code, sku_code, actual_month;

-- =====================================================================
-- 7. RANG BUOC NGHIEP VU QUAN TRONG (validate ngay o tang app, ghi lai
--    o day de doi dev/DBA hieu ro quy tac)
-- =====================================================================
-- a) SUM(weekly_region_splits.quantity WHERE sku, thang dau tien cua cycle)
--    phai = monthly_forecast_lines.quantity cua thang do (cung version).
--    -> CHAN CUNG: khong cho submit neu lech (xem trigger o muc 8).
--       App/UI nen validate truoc (client-side) de bao loi som, DB trigger
--       la lop bao ve cuoi cung.
-- b) weekly_region_splits chi duoc tao cho forecast_month = base_month
--    cua cycle (thang dau tien), khong cho 3 thang con lai.
-- c) Khi 1 version duoc set is_final = TRUE, cac version cu cua cung
--    cycle nen chuyen is_final = FALSE (da xu ly bang unique index o tren,
--    app can UPDATE ca 2 dong trong 1 transaction).
-- d) Khong cho sua monthly_forecast_lines / weekly_region_splits khi
--    forecast_cycles.status IN ('approved','locked').

-- =====================================================================
-- 8. TRIGGER: CHAN CUNG (hard block) khi submit neu tong tuan/mien
--    khong khop tong thang dau tien. Day la lop bao ve cuoi cung o DB -
--    tang app/UI nen validate truoc de bao loi som cho nguoi dung, con
--    trigger nay dam bao khong co du lieu sai lot qua duoc du app co bug.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_validate_weekly_region_submit()
RETURNS TRIGGER AS $$
DECLARE
    v_base_month        DATE;
    v_mismatch_count     INTEGER;
BEGIN
    -- Chi kiem tra tai thoi diem version chuyen sang da submit
    -- (submitted_at duoc set lan dau, tu NULL sang co gia tri)
    IF NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL THEN
        SELECT fc.base_month INTO v_base_month
        FROM forecast_cycles fc
        WHERE fc.id = NEW.cycle_id;

        SELECT COUNT(*) INTO v_mismatch_count
        FROM (
            SELECT mfl.sku_code,
                   mfl.quantity                        AS month_qty,
                   COALESCE(SUM(wrs.quantity), 0)       AS week_qty
            FROM monthly_forecast_lines mfl
            LEFT JOIN weekly_region_splits wrs
                   ON wrs.version_id = mfl.version_id
                  AND wrs.sku_code   = mfl.sku_code
            WHERE mfl.version_id = NEW.id
              AND mfl.forecast_month = v_base_month
            GROUP BY mfl.sku_code, mfl.quantity
        ) x
        WHERE x.month_qty <> x.week_qty
    ;

        IF v_mismatch_count > 0 THEN
            RAISE EXCEPTION
                'Khong the submit: % SKU co tong tuan/mien khac tong ke hoach thang dau tien (version %)',
                v_mismatch_count, NEW.id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_weekly_region_submit
    BEFORE UPDATE ON forecast_versions
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_weekly_region_submit();

-- =====================================================================
-- 9. DU LIEU DANH MUC MAU (vi du, thay bang du lieu thuc te)
-- =====================================================================
INSERT INTO business_units (code, name) VALUES
    ('MT','Modern Trade'), ('XK','Xuat khau'), ('OEM','OEM'),
    ('GT2','General Trade 2'), ('MLT','MLT'), ('Retail','Ban le'),
    ('Online','Sales online'), ('GT1','General Trade 1')
ON CONFLICT DO NOTHING;

INSERT INTO regions (code, name) VALUES
    ('MB','Mien Bac'), ('MN','Mien Nam')
ON CONFLICT DO NOTHING;
