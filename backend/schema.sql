-- DRISHTI Database Schema
-- Diabetic Retinopathy Screening & Staging System

CREATE DATABASE IF NOT EXISTS drishti;
USE drishti;

-- 1. Users Table (Doctors, Clinicians, Admins)
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'doctor',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Patients Table
CREATE TABLE IF NOT EXISTS patients (
    patient_id VARCHAR(50) PRIMARY KEY,
    user_id INT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    age INT NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(20) NOT NULL,
    contact_number VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    past_illness TEXT,
    chronic_diseases TEXT,
    past_surgeries TEXT,
    allergies TEXT,
    current_medications TEXT,
    symptoms TEXT,
    clinical_notes TEXT,
    emergency_name VARCHAR(255),
    relationship VARCHAR(100),
    emergency_number VARCHAR(50),
    screening_type VARCHAR(100) DEFAULT 'Diabetes Screening',
    priority VARCHAR(50) DEFAULT 'Normal',
    referred_by VARCHAR(255),
    notes TEXT,
    doctor_name VARCHAR(255),
    screening_date DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_screening_date (screening_date)
);

-- 3. Screenings Table
CREATE TABLE IF NOT EXISTS screenings (
    screening_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    doctor_name VARCHAR(255),
    screening_type VARCHAR(100) DEFAULT 'Diabetes Screening',
    priority VARCHAR(50) DEFAULT 'Normal',
    prediction VARCHAR(100) NOT NULL,
    confidence FLOAT DEFAULT 0,
    no_dr FLOAT DEFAULT 0,
    mild FLOAT DEFAULT 0,
    moderate FLOAT DEFAULT 0,
    severe FLOAT DEFAULT 0,
    proliferative_dr FLOAT DEFAULT 0,
    screening_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_patient (patient_id),
    INDEX idx_date (screening_date)
);

-- Default Demo Doctor Account
-- Password: password123 (bcrypt hash)
INSERT INTO users (name, email, password_hash, phone, role)
SELECT 'Dr. Ananya Sharma', 'dr.ananya@dire.com', '$2b$10$fYt8fRKa67zQC9sxaF.D6erorAc6J8D5JOR7StclkgHRtJuXlMro6', '+91 98765 43210', 'doctor'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'dr.ananya@dire.com');
