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
        double T20 = T11;  // 20km temp = end of isothermal layer at 11km (matches JS)
        double L2  = 0.001;
        T = T20 + L2 * (alt - 20000.0);
        P = P20 * std::pow(T / T20, -g / (Rd * L2));
    } else if (alt <= 47000.0) {
        // ISA layer 3: Upper Stratosphere, lapse rate +2.8°C/km (warming)
        double rho32 = calcAirDensity(32000.0, tempOffset, 0.0);
        // Use barometric formula with scale height approximation
        double scaleH = 6500.0;
        return rho32 * std::exp(-(alt - 32000.0) / scaleH);
    } else if (alt <= 80000.0) {
        double rho47 = calcAirDensity(47000.0, tempOffset, 0.0);
        double scaleH = 7000.0;
        return rho47 * std::exp(-(alt - 47000.0) / scaleH);
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
    if (alt < 47000) return "Stratopause Region";
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

    // [F13] Projectile: decompose initial velocity into components
    const double launchRad = input.launchAngle * M_PI / 180.0;
    const double azimRad   = input.launchAzimuth * M_PI / 180.0;
    double vy = -(input.v0 * std::sin(launchRad));
    double vx =   input.v0 * std::cos(launchRad) * std::sin(azimRad);
    double vz =   input.v0 * std::cos(launchRad) * std::cos(azimRad);

    // [F12] Slope: add gravity component along slope direction
    const double slopeRad    = input.terrainSlope * M_PI / 180.0;
    const double g_vert_eff  = g * std::cos(slopeRad);
    const double g_slope     = g * std::sin(slopeRad);

    double altitude = input.height;
    double posX = 0.0, posZ = 0.0;
    double t = 0.0;

    std::vector<PhysicsFrame> traj;
    traj.reserve(20000);

    while (altitude > 0.0 && t < 7200.0) {
        double rho = calcAirDensity(altitude, input.tempOffset, input.humidity);

        // Use total relative velocity for drag — physically correct for 3-D flight.
        // Per-axis independent drag overestimates force when both horizontal and
        // vertical components are large (projectile / wind scenarios).
        double vRelX   = vx - Wx;
        double vRelY   = vy;
        double vRelZ   = vz - Wz;
        double vRelMag = std::sqrt(vRelX*vRelX + vRelY*vRelY + vRelZ*vRelZ);
        double dragBase = 0.5 * rho * obj.cd * obj.area * vRelMag; // F_drag / v_rel

        double accel_x = -(dragBase * vRelX) / obj.mass + g_slope;
        double accel_y =  (obj.mass * g_vert_eff - dragBase * vRelY) / obj.mass;
        double accel_z = -(dragBase * vRelZ) / obj.mass;

        // [F7] Magnus effect: F = 0.5 * C_L * rho * A * omega * (spinAxis × v)
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
        frame.dragForce  = dragBase * vRelMag; // total drag magnitude = 0.5*rho*cd*A*v²
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

    double J = obj.mass * impactVelocity;

    // Collision time decreases at higher impact velocities — faster impacts generate
    // shorter force pulses, which raises peak force for the same momentum.
    double baseTime = 0.001 + 0.009 * (target.yieldStrength / 250.0);
    double velFactor = std::max(0.15, std::min(1.0, 20.0 / (std::abs(impactVelocity) + 1e-6)));
    double collisionTime = std::clamp(baseTime * velFactor, 0.0002, 0.02);
    double F_avg = J / collisionTime;

    double contactArea   = M_PI * obj.radius * obj.radius;
    if (contactArea < 1e-6) contactArea = 1e-6;
    double pressure_Pa   = F_avg / contactArea;
    double pressure_MPa  = pressure_Pa / 1e6;

    // Thickness-based effective yield: sqrt scale relative to 10 cm reference
    const double refThickness = 0.1;
    double thicknessRatio  = target.thickness / refThickness;
    if (thicknessRatio < 0.05) thicknessRatio = 0.05;
    double thicknessFactor = std::sqrt(thicknessRatio);

    // Brittle materials (shatter mode) fail at much lower average pressure due to
    // low fracture toughness and stress concentration under dynamic impact.
    double brittleFactor = (target.fractureMode == "shatter") ? 8.0 : 1.0;
    double effectiveYield  = target.yieldStrength * thicknessFactor / brittleFactor;

    double rawRatio = pressure_MPa / effectiveYield;
    double destructionRatio;
    if (rawRatio <= 1.0) {
        destructionRatio = 0.0;
    } else {
        destructionRatio = 1.0 - std::exp(-1.1 * (rawRatio - 1.0));
    }
    destructionRatio = std::clamp(destructionRatio, 0.0, 1.0);

    std::string level;
    if (destructionRatio <= 0.001)     level = "Withstood";
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
    // Seed varies with simulation so each run produces unique fragment patterns
    unsigned int seed = (unsigned int)(impact.impactVelocity * 1000.0 + impact.destructionRatio * 99991.0);
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> pos(-radius*1.5f, radius*1.5f);
    std::uniform_real_distribution<float> vel(-12.0f, 12.0f);
    std::uniform_real_distribution<float> avel(-8.0f, 8.0f);
    for (int i = 0; i < count; i++) {
        float cx = pos(rng), cz = pos(rng);
        float size = radius*0.2f*(0.4f+(float)(rng()%100)/100.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, (int)(seed % 10000) + i);
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
    unsigned int seed = (unsigned int)(impact.impactEnergy * 0.01 + impact.destructionRatio * 99991.0);
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> pos(-radius*1.2f, radius*1.2f);
    std::uniform_real_distribution<float> vel(-6.0f, 6.0f);
    std::uniform_real_distribution<float> avel(-4.0f, 4.0f);
    for (int i = 0; i < count; i++) {
        float cx = pos(rng), cz = pos(rng);
        float size = radius*0.4f*(0.5f+(float)(rng()%100)/100.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, (int)(seed % 10000) + i + 100);
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

// Metal-like fracture: splits into a small number of large chunks flying outward.
FractureResult PhysicsEngine::computeSplit(const ImpactResult& impact, const TargetObject& target, float radius, int pieces) {
    FractureResult result;
    result.mode = "split";
    if (pieces < 2) pieces = 2;
    unsigned int seed = (unsigned int)(impact.impactForce * 0.001 + pieces * 7);
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> jit(-radius*0.25f, radius*0.25f);
    std::uniform_real_distribution<float> avel(-3.0f, 3.0f);
    for (int i = 0; i < pieces; i++) {
        float angle = (float)i/pieces*2.0f*(float)M_PI + 0.3f;
        float dist  = radius*0.5f;
        float cx = std::cos(angle)*dist + jit(rng);
        float cz = std::sin(angle)*dist + jit(rng);
        float size = radius*0.7f*(0.8f+(float)(rng()%100)/300.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, i*37+3);
        frag.indices   = buildFragmentIndices((int)frag.vertices.size()/3);
        frag.position  = {cx, 0.0f, cz};
        float outV = 3.0f + impact.destructionRatio*4.0f;
        frag.velocity  = {std::cos(angle)*outV, std::abs(avel(rng))*0.6f+2.0f, std::sin(angle)*outV};
        frag.angularVelocity = {avel(rng), avel(rng), avel(rng)};
        frag.rotation  = {0.0f, 0.0f, 0.0f, 1.0f};
        frag.mass      = size*size*3.0f;
        frag.active    = true;
        result.fragments.push_back(frag);
    }
    result.dustParticleCount = pieces*3;
    return result;
}

FractureResult PhysicsEngine::computeFracture(const ImpactResult& impact, const TargetObject& target, float objectRadius) {
    if (impact.destructionRatio < 0.03f) {
        FractureResult r; r.mode="none"; r.dustParticleCount=0; return r;
    }
    if (target.fractureMode == "shatter")  return computeShatter(impact, target, objectRadius);
    if (target.fractureMode == "split")    return computeSplit(impact, target, objectRadius, 3);
    if (target.fractureMode == "deform") {
        if (impact.destructionRatio >= 0.6f) return computeSplit(impact, target, objectRadius, 3);
        return computeDeform(impact, target, objectRadius);
    }
    return computeFractureMode(impact, target, objectRadius);
}

std::vector<FragmentState> PhysicsEngine::stepFragments(
    std::vector<Fragment>& fragments, double dt, double gravity)
{
    // Simple air drag coefficient for fragments (rho=1.225, cd=0.47, area estimated from mass)
    const float AIR_DRAG = 0.5f * 1.225f * 0.47f;
    std::vector<FragmentState> states;
    for (auto& frag : fragments) {
        if (!frag.active) { states.push_back({frag.position, frag.rotation, false}); continue; }

        // Air drag on fragments: F = 0.5 * rho * cd * A * v^2, A estimated from mass
        float estArea = frag.mass * 0.05f; // rough cross-section estimate
        if (estArea < 0.001f) estArea = 0.001f;
        float vx = frag.velocity[0], vy_f = frag.velocity[1], vz_f = frag.velocity[2];
        float vMag = std::sqrt(vx*vx + vy_f*vy_f + vz_f*vz_f);
        if (vMag > 0.01f && frag.mass > 1e-6f) {
            float dragAcc = AIR_DRAG * estArea * vMag / frag.mass;
            frag.velocity[0] -= dragAcc * vx * (float)dt;
            frag.velocity[1] -= dragAcc * vy_f * (float)dt;
            frag.velocity[2] -= dragAcc * vz_f * (float)dt;
        }

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
