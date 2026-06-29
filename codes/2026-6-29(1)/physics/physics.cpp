#define _USE_MATH_DEFINES
#include "physics.h"
#include <cmath>
#include <algorithm>
#include <stdexcept>
#include <random>

std::vector<FallingObject> PhysicsEngine::getPresetFallingObjects() {
    return {
        {"Bowling Ball",     7.0,    0.47, 0.0573, 0.135},
        {"Human (Freefall)", 70.0,   1.0,  0.70,   0.30},
        {"Small Car",        1200.0, 0.30, 2.20,   0.90},
        {"Meteor (1m)",      2000.0, 0.47, 0.785,  0.50},
        {"Piano",            300.0,  1.20, 1.50,   0.70},
        {"Refrigerator",     80.0,   1.05, 0.60,   0.40},
        {"Iron Ball (50cm)", 500.0,  0.47, 0.196,  0.25},
    };
}

std::vector<TargetObject> PhysicsEngine::getPresetTargetObjects() {
    return {
        {"Wooden Board",   40.0,  0.10, "wood",     "fracture"},
        {"Concrete Floor", 30.0,  0.40, "concrete", "fracture"},
        {"Steel Plate",    250.0, 0.02, "steel",    "deform"},
        {"Glass",          7.0,   0.012,"glass",    "shatter"},
        {"Brick Wall",     10.0,  0.40, "brick",    "fracture"},
        {"Car Roof",       180.0, 0.004,"steel",    "deform"},
    };
}

double PhysicsEngine::calcAirDensity(double alt, double tempOffset, double humidity) {
    if (alt < 0) alt = 0;
    const double Rd = 287.05, g = 9.80665, L0 = 0.0065;
    const double T0 = 288.15 + tempOffset;
    const double P0 = 101325.0;
    double T = 0.0, P = 0.0;
    if (alt <= 11000.0) {
        T = T0 - L0 * alt;
        P = P0 * std::pow(T / T0, g / (Rd * L0));
    } else if (alt <= 20000.0) {
        double T11 = T0 - L0 * 11000.0;
        double P11 = P0 * std::pow(T11 / T0, g / (Rd * L0));
        T = T11;
        P = P11 * std::exp(-g * (alt - 11000.0) / (Rd * T11));
    } else if (alt <= 32000.0) {
        double T11 = T0 - L0 * 11000.0;
        double P11 = P0 * std::pow(T11 / T0, g / (Rd * L0));
        double P20 = P11 * std::exp(-g * 9000.0 / (Rd * T11));
        double T20 = 216.65 + tempOffset * 0.5;
        double L2  = 0.001;
        T = T20 + L2 * (alt - 20000.0);
        P = P20 * std::pow(T / T20, -g / (Rd * L2));
    } else if (alt <= 80000.0) {
        return calcAirDensity(32000.0, tempOffset, humidity) * std::exp(-0.0001 * (alt - 32000.0));
    } else {
        return 1e-5;
    }
    double rho = P / (Rd * T);
    if (humidity > 0.0 && T > 200.0) {
        double Tc  = T - 273.15;
        double e_s = 611.2 * std::exp(17.67 * Tc / (Tc + 243.04));
        double e   = (humidity / 100.0) * e_s;
        rho *= (1.0 - 0.378 * e / P);
    }
    return std::max(rho, 1e-5);
}

std::string PhysicsEngine::getAtmosphereName(double alt) {
    if (alt < 0)     return "Underground";
    if (alt < 11000) return "Troposphere";
    if (alt < 20000) return "Lower Stratosphere";
    if (alt < 32000) return "Upper Stratosphere";
    if (alt < 50000) return "Stratopause";
    if (alt < 80000) return "Mesosphere";
    return "Near Vacuum";
}

double PhysicsEngine::calcTerminalVelocityAtAlt(
    const FallingObject& obj, double altitude, double gravity,
    double tempOffset, double humidity)
{
    double rho = calcAirDensity(altitude, tempOffset, humidity);
    if (rho < 1e-10) return 1e9;
    return std::sqrt((2.0 * obj.mass * gravity) / (rho * obj.cd * obj.area));
}

ImpactResult PhysicsEngine::simulate(const SimInput& input) {
    if (input.height <= 0)
        throw std::invalid_argument("Height must be greater than 0.");

    const double g   = input.gravity;
    const FallingObject& obj = input.falling;
    const double dt  = 0.05;
    const double Wx  = input.windX;
    const double Wz  = input.windZ;

    // [F13] Projectile: 발사각/방향으로 초기 속도 분해
    const double launchRad = input.launchAngle * M_PI / 180.0;
    const double azimRad   = input.launchAzimuth * M_PI / 180.0;
    double vy = -(input.v0 * std::sin(launchRad));
    double vx =   input.v0 * std::cos(launchRad) * std::sin(azimRad);
    double vz =   input.v0 * std::cos(launchRad) * std::cos(azimRad);

    // [F12] 경사면: 중력의 경사 방향 성분 추가
    const double slopeRad    = input.terrainSlope * M_PI / 180.0;
    const double g_vert_eff  = g * std::cos(slopeRad);  // 유효 수직 중력
    const double g_slope     = g * std::sin(slopeRad);  // 경사 방향 중력 성분

    double altitude = input.height;
    double posX = 0.0, posZ = 0.0;
    double t = 0.0;

    std::vector<PhysicsFrame> traj;
    traj.reserve(2000);

    while (altitude > 0.0 && t < 7200.0) {
        double rho = calcAirDensity(altitude, input.tempOffset, input.humidity);

        // 수직 항력 (운동 방향 반대)
        double drag_y  = 0.5 * rho * obj.cd * obj.area * vy * vy;
        double sign_vy = (vy >= 0.0) ? 1.0 : -1.0;
        double accel_y = (obj.mass * g_vert_eff - sign_vy * drag_y) / obj.mass;

        // 수평 바람 항력
        double vRelX   = vx - Wx;
        double vRelZ   = vz - Wz;
        double accel_x = -(0.5 * rho * obj.cd * obj.area * vRelX * std::abs(vRelX)) / obj.mass + g_slope;
        double accel_z = -(0.5 * rho * obj.cd * obj.area * vRelZ * std::abs(vRelZ)) / obj.mass;

        // [F7] Magnus 효과: F = 0.5 * C_L * rho * A * omega * (spinAxis × v)
        if (input.spinRate > 0.001) {
            const double CL = 0.25;
            double omega  = input.spinRate;
            double sx = input.spinAxisX, sy = input.spinAxisY, sz = input.spinAxisZ;
            double fscale = 0.5 * CL * rho * obj.area * omega / obj.mass;
            accel_x += fscale * (sy * vz - sz * vy);
            accel_y += fscale * (sz * vx - sx * vz);
            accel_z += fscale * (sx * vy - sy * vx);
        }

        PhysicsFrame frame;
        frame.time       = t;
        frame.velocity   = vy;
        frame.altitude   = altitude;
        frame.dragForce  = drag_y;
        frame.netForce   = obj.mass * accel_y;
        frame.airDensity = rho;
        frame.atmosphere = getAtmosphereName(altitude);
        frame.posX       = posX;
        frame.posZ       = posZ;
        traj.push_back(frame);

        vy       += accel_y * dt;
        altitude -= vy * dt;
        vx       += accel_x * dt;
        vz       += accel_z * dt;
        posX     += vx * dt;
        posZ     += vz * dt;
        t        += dt;
    }

    double impactV = traj.empty() ? vy : traj.back().velocity;
    return calcImpact(input, impactV, traj);
}

ImpactResult PhysicsEngine::calcImpact(
    const SimInput& input, double impactVelocity,
    const std::vector<PhysicsFrame>& traj)
{
    const FallingObject& obj    = input.falling;
    const TargetObject&  target = input.target;

    double J             = obj.mass * impactVelocity;
    double collisionTime = 0.001 + 0.009 * (target.yieldStrength / 250.0);
    collisionTime        = std::clamp(collisionTime, 0.0005, 0.02);
    double F_avg         = J / collisionTime;

    double contactArea   = M_PI * obj.radius * obj.radius;
    if (contactArea < 1e-6) contactArea = 1e-6;
    double pressure_Pa   = F_avg / contactArea;
    double pressure_MPa  = pressure_Pa / 1e6;

    // ── 두께 기반 유효 항복강도 ──
    // 두꺼울수록 더 잘 버틴다(기준 두께 10cm 대비 제곱근 스케일).
    const double refThickness = 0.1;
    double thicknessRatio  = target.thickness / refThickness;
    if (thicknessRatio < 0.05) thicknessRatio = 0.05;
    double thicknessFactor = std::sqrt(thicknessRatio);

    // ── 취성(brittle) 충격 취약 보정 ──
    // 유리처럼 깨지는(shatter) 재료는 파괴 인성이 낮고 국부 응력 집중에 매우 취약해서,
    // 단면 평균 압력이 정적 항복강도보다 한참 낮아도 충격으로 깨진다.
    // 따라서 충격 상황에서의 유효 저항을 크게 낮춘다(평균 압력 비교 모델의 과대평가 보정).
    // 연성/일반 파괴 재료(강판·목재·콘크리트·벽돌)는 영향 없음(계수 1.0).
    double brittleFactor = (target.fractureMode == "shatter") ? 8.0 : 1.0;
    double effectiveYield  = target.yieldStrength * thicknessFactor / brittleFactor;

    // ── 임계 기반 파괴 ──
    // 충격 압력이 유효 항복강도를 넘어설 때까지 재질이 버티고(0%),
    // 넘어선 뒤부터 점진적으로 파괴된다.
    double rawRatio = pressure_MPa / effectiveYield;
    double destructionRatio;
    if (rawRatio <= 1.0) {
        destructionRatio = 0.0;                              // 버팀 (부서지지 않음)
    } else {
        destructionRatio = 1.0 - std::exp(-1.1 * (rawRatio - 1.0));
    }
    destructionRatio = std::clamp(destructionRatio, 0.0, 1.0);

    std::string level;
    if (destructionRatio <= 0.001)     level = "Withstood";       // 버팀
    else if (destructionRatio < 0.30)  level = "Minor Damage";
    else if (destructionRatio < 0.55)  level = "Moderate Damage";
    else if (destructionRatio < 0.80)  level = "Severe Damage";
    else                               level = "Total Destruction";

    ImpactResult result;
    result.terminalVelocity = calcTerminalVelocityAtAlt(
        input.falling, 0, input.gravity, input.tempOffset, input.humidity);
    result.impactVelocity   = impactVelocity;
    result.impactMomentum   = J;
    result.impactForce      = F_avg;
    result.impactPressure   = pressure_MPa;
    result.impactEnergy     = 0.5 * obj.mass * impactVelocity * impactVelocity;
    result.destructionRatio = destructionRatio;
    result.destructionLevel = level;
    result.trajectory       = traj;
    return result;
}

std::vector<float> PhysicsEngine::buildConvexFragment(float cx, float cy, float cz, float size, int seed) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> jitter(-size*0.35f, size*0.35f);
    std::uniform_real_distribution<float> sc(0.5f, 1.0f);
    std::vector<float> verts;
    int faces = 6+(seed%5);
    for (int i = 0; i < faces; i++) {
        float theta = (float)i/faces*2.0f*(float)M_PI;
        for (int j = 0; j < 3; j++) {
            float phi = ((float)j/3.0f-0.5f)*(float)M_PI;
            float r   = size*sc(rng);
            verts.push_back(cx+r*std::cos(phi)*std::cos(theta)+jitter(rng));
            verts.push_back(cy+r*std::sin(phi)+jitter(rng));
            verts.push_back(cz+r*std::cos(phi)*std::sin(theta)+jitter(rng));
        }
    }
    return verts;
}

std::vector<unsigned int> PhysicsEngine::buildFragmentIndices(int vertexCount) {
    std::vector<unsigned int> idx;
    for (int i = 0; i < vertexCount-2; i++) {
        idx.push_back(0); idx.push_back(i+1); idx.push_back(i+2);
    }
    return idx;
}

FractureResult PhysicsEngine::computeShatter(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "shatter";
    int count = (int)(impact.destructionRatio*100)+20;
    std::mt19937 rng(42);
    std::uniform_real_distribution<float> pos(-radius*1.5f, radius*1.5f);
    std::uniform_real_distribution<float> vel(-12.0f, 12.0f);
    std::uniform_real_distribution<float> avel(-8.0f, 8.0f);
    for (int i = 0; i < count; i++) {
        float cx = pos(rng), cz = pos(rng);
        float size = radius*0.2f*(0.4f+(float)(rng()%100)/100.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, i);
        frag.indices   = buildFragmentIndices((int)frag.vertices.size()/3);
        frag.position  = {cx, 0.0f, cz};
        frag.velocity  = {vel(rng), std::abs(vel(rng))*2.5f+3.0f, vel(rng)};
        frag.angularVelocity = {avel(rng), avel(rng), avel(rng)};
        frag.rotation  = {0.0f, 0.0f, 0.0f, 1.0f};
        frag.mass      = size*size*0.5f;
        frag.active    = true;
        result.fragments.push_back(frag);
    }
    result.dustParticleCount = count*4;
    return result;
}

FractureResult PhysicsEngine::computeFractureMode(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "fracture";
    int count = (int)(impact.destructionRatio*20)+5;
    std::mt19937 rng(99);
    std::uniform_real_distribution<float> pos(-radius*1.2f, radius*1.2f);
    std::uniform_real_distribution<float> vel(-6.0f, 6.0f);
    std::uniform_real_distribution<float> avel(-4.0f, 4.0f);
    for (int i = 0; i < count; i++) {
        float cx = pos(rng), cz = pos(rng);
        float size = radius*0.4f*(0.5f+(float)(rng()%100)/100.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, i+100);
        frag.indices   = buildFragmentIndices((int)frag.vertices.size()/3);
        frag.position  = {cx, 0.0f, cz};
        frag.velocity  = {vel(rng), std::abs(vel(rng))*1.5f+1.5f, vel(rng)};
        frag.angularVelocity = {avel(rng), avel(rng), avel(rng)};
        frag.rotation  = {0.0f, 0.0f, 0.0f, 1.0f};
        frag.mass      = size*size*2.0f;
        frag.active    = true;
        result.fragments.push_back(frag);
    }
    result.dustParticleCount = count*6;
    return result;
}

FractureResult PhysicsEngine::computeDeform(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "deform";
    float depth = (float)(impact.destructionRatio*radius*1.2f);
    int ring = 10;
    for (int i = 0; i <= ring; i++) {
        float r    = (float)i/ring*radius;
        float disp = -depth*std::exp(-3.0f*r/radius);
        int pts    = std::max(1, i*4);
        for (int j = 0; j < pts; j++) {
            float angle = (float)j/pts*2.0f*(float)M_PI;
            DeformVertex dv;
            dv.index = i*10+j;
            dv.dx    = r*std::cos(angle)*0.05f;
            dv.dy    = disp;
            dv.dz    = r*std::sin(angle)*0.05f;
            result.deformations.push_back(dv);
        }
    }
    result.dustParticleCount = (int)(impact.destructionRatio*40);
    return result;
}

FractureResult PhysicsEngine::computeFracture(const ImpactResult& impact, const TargetObject& target, float objectRadius) {
    if (impact.destructionRatio < 0.03f) {
        FractureResult r; r.mode="none"; r.dustParticleCount=0; return r;
    }
    if (target.fractureMode == "shatter")  return computeShatter(impact, target, objectRadius);
    if (target.fractureMode == "deform")   return computeDeform(impact, target, objectRadius);
    return computeFractureMode(impact, target, objectRadius);
}

std::vector<FragmentState> PhysicsEngine::stepFragments(
    std::vector<Fragment>& fragments, double dt, double gravity)
{
    std::vector<FragmentState> states;
    for (auto& frag : fragments) {
        if (!frag.active) { states.push_back({frag.position, frag.rotation, false}); continue; }
        frag.velocity[1] -= (float)(gravity*dt);
        frag.position[0] += frag.velocity[0]*(float)dt;
        frag.position[1] += frag.velocity[1]*(float)dt;
        frag.position[2] += frag.velocity[2]*(float)dt;
        if (frag.position[1] < -0.5f) {
            frag.position[1]  = -0.5f;
            frag.velocity[1] *= -0.35f;
            frag.velocity[0] *= 0.65f;
            frag.velocity[2] *= 0.65f;
            frag.angularVelocity[0] *= 0.5f;
            frag.angularVelocity[2] *= 0.5f;
            if (std::abs(frag.velocity[1]) < 0.1f) frag.active = false;
        }
        float ax=frag.angularVelocity[0]*(float)dt, ay=frag.angularVelocity[1]*(float)dt, az=frag.angularVelocity[2]*(float)dt;
        float qx=frag.rotation[0], qy=frag.rotation[1], qz=frag.rotation[2], qw=frag.rotation[3];
        frag.rotation[0] = qx+(qw*ax-qz*ay+qy*az)*0.5f;
        frag.rotation[1] = qy+(qz*ax+qw*ay-qx*az)*0.5f;
        frag.rotation[2] = qz+(-qy*ax+qx*ay+qw*az)*0.5f;
        frag.rotation[3] = qw+(-qx*ax-qy*ay-qz*az)*0.5f;
        float len = std::sqrt(frag.rotation[0]*frag.rotation[0]+frag.rotation[1]*frag.rotation[1]+frag.rotation[2]*frag.rotation[2]+frag.rotation[3]*frag.rotation[3]);
        if (len > 0) { frag.rotation[0]/=len; frag.rotation[1]/=len; frag.rotation[2]/=len; frag.rotation[3]/=len; }
        states.push_back({frag.position, frag.rotation, frag.active});
    }
    return states;
}
