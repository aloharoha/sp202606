#include <napi.h>
#include "physics.h"
#include <stdexcept>

static std::vector<Fragment> g_fragments;

static Napi::Object FallingObjectToJS(Napi::Env env, const FallingObject& obj) {
    auto o = Napi::Object::New(env);
    o.Set("name",   Napi::String::New(env, obj.name));
    o.Set("mass",   Napi::Number::New(env, obj.mass));
    o.Set("cd",     Napi::Number::New(env, obj.cd));
    o.Set("area",   Napi::Number::New(env, obj.area));
    o.Set("radius", Napi::Number::New(env, obj.radius));
    return o;
}

static Napi::Object TargetObjectToJS(Napi::Env env, const TargetObject& obj) {
    auto o = Napi::Object::New(env);
    o.Set("name",          Napi::String::New(env, obj.name));
    o.Set("yieldStrength", Napi::Number::New(env, obj.yieldStrength));
    o.Set("thickness",     Napi::Number::New(env, obj.thickness));
    o.Set("material",      Napi::String::New(env, obj.material));
    o.Set("fractureMode",  Napi::String::New(env, obj.fractureMode));
    return o;
}

Napi::Value GetFallingObjects(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto list = PhysicsEngine::getPresetFallingObjects();
    auto arr  = Napi::Array::New(env, list.size());
    for (size_t i = 0; i < list.size(); i++) arr[i] = FallingObjectToJS(env, list[i]);
    return arr;
}

Napi::Value GetTargetObjects(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto list = PhysicsEngine::getPresetTargetObjects();
    auto arr  = Napi::Array::New(env, list.size());
    for (size_t i = 0; i < list.size(); i++) arr[i] = TargetObjectToJS(env, list[i]);
    return arr;
}

Napi::Value Simulate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected an object argument.").ThrowAsJavaScriptException();
        return env.Null();
    }
    Napi::Object inp = info[0].As<Napi::Object>();
    try {
        Napi::Object fObj = inp.Get("falling").As<Napi::Object>();
        FallingObject falling;
        falling.name   = fObj.Get("name").As<Napi::String>().Utf8Value();
        falling.mass   = fObj.Get("mass").As<Napi::Number>().DoubleValue();
        falling.cd     = fObj.Get("cd").As<Napi::Number>().DoubleValue();
        falling.area   = fObj.Get("area").As<Napi::Number>().DoubleValue();
        falling.radius = fObj.Get("radius").As<Napi::Number>().DoubleValue();

        Napi::Object tObj = inp.Get("target").As<Napi::Object>();
        TargetObject target;
        target.name          = tObj.Get("name").As<Napi::String>().Utf8Value();
        target.yieldStrength = tObj.Get("yieldStrength").As<Napi::Number>().DoubleValue();
        target.thickness     = tObj.Get("thickness").As<Napi::Number>().DoubleValue();
        target.material      = tObj.Has("material")     ? tObj.Get("material").As<Napi::String>().Utf8Value()     : "concrete";
        target.fractureMode  = tObj.Has("fractureMode") ? tObj.Get("fractureMode").As<Napi::String>().Utf8Value() : "fracture";

        SimInput simInput;
        simInput.falling = falling;
        simInput.target  = target;
        simInput.height  = inp.Get("height").As<Napi::Number>().DoubleValue();
        simInput.gravity = inp.Has("gravity") ? inp.Get("gravity").As<Napi::Number>().DoubleValue() : 9.81;
        simInput.v0      = inp.Has("v0")      ? inp.Get("v0").As<Napi::Number>().DoubleValue()      : 0.0;

        ImpactResult res = PhysicsEngine::simulate(simInput);

        auto result = Napi::Object::New(env);
        result.Set("terminalVelocity", Napi::Number::New(env, res.terminalVelocity));
        result.Set("impactVelocity",   Napi::Number::New(env, res.impactVelocity));
        result.Set("impactMomentum",   Napi::Number::New(env, res.impactMomentum));
        result.Set("impactForce",      Napi::Number::New(env, res.impactForce));
        result.Set("impactPressure",   Napi::Number::New(env, res.impactPressure));
        result.Set("destructionRatio", Napi::Number::New(env, res.destructionRatio));
        result.Set("destructionLevel", Napi::String::New(env, res.destructionLevel));

        const auto& traj = res.trajectory;
        size_t step = std::max((size_t)1, traj.size() / 120);
        auto trajArr = Napi::Array::New(env);
        uint32_t idx = 0;
        for (size_t i = 0; i < traj.size(); i += step) {
            auto frame = Napi::Object::New(env);
            frame.Set("time",        Napi::Number::New(env, traj[i].time));
            frame.Set("velocity",    Napi::Number::New(env, traj[i].velocity));
            frame.Set("altitude",    Napi::Number::New(env, traj[i].altitude));
            frame.Set("dragForce",   Napi::Number::New(env, traj[i].dragForce));
            frame.Set("netForce",    Napi::Number::New(env, traj[i].netForce));
            frame.Set("airDensity",  Napi::Number::New(env, traj[i].airDensity));
            frame.Set("atmosphere",  Napi::String::New(env, traj[i].atmosphere));
            trajArr[idx++] = frame;
        }
        result.Set("trajectory", trajArr);
        return result;
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

Napi::Value ComputeFracture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected impact and target arguments.").ThrowAsJavaScriptException();
        return env.Null();
    }
    try {
        Napi::Object impObj = info[0].As<Napi::Object>();
        Napi::Object tgtObj = info[1].As<Napi::Object>();
        float objRadius     = info.Length() >= 3 ? info[2].As<Napi::Number>().FloatValue() : 1.0f;

        ImpactResult impact;
        impact.destructionRatio = impObj.Get("destructionRatio").As<Napi::Number>().DoubleValue();
        impact.impactForce      = impObj.Get("impactForce").As<Napi::Number>().DoubleValue();
        impact.impactPressure   = impObj.Get("impactPressure").As<Napi::Number>().DoubleValue();
        impact.impactVelocity   = impObj.Get("impactVelocity").As<Napi::Number>().DoubleValue();
        impact.impactMomentum   = impObj.Get("impactMomentum").As<Napi::Number>().DoubleValue();
        impact.terminalVelocity = impObj.Get("terminalVelocity").As<Napi::Number>().DoubleValue();
        impact.destructionLevel = impObj.Get("destructionLevel").As<Napi::String>().Utf8Value();

        TargetObject target;
        target.name          = tgtObj.Get("name").As<Napi::String>().Utf8Value();
        target.yieldStrength = tgtObj.Get("yieldStrength").As<Napi::Number>().DoubleValue();
        target.thickness     = tgtObj.Get("thickness").As<Napi::Number>().DoubleValue();
        target.material      = tgtObj.Has("material")     ? tgtObj.Get("material").As<Napi::String>().Utf8Value()     : "concrete";
        target.fractureMode  = tgtObj.Has("fractureMode") ? tgtObj.Get("fractureMode").As<Napi::String>().Utf8Value() : "fracture";

        FractureResult fr = PhysicsEngine::computeFracture(impact, target, objRadius);
        g_fragments = fr.fragments;

        auto result = Napi::Object::New(env);
        result.Set("mode",             Napi::String::New(env, fr.mode));
        result.Set("dustParticleCount",Napi::Number::New(env, fr.dustParticleCount));

        auto fragArr = Napi::Array::New(env, fr.fragments.size());
        for (size_t i = 0; i < fr.fragments.size(); i++) {
            const auto& f = fr.fragments[i];
            auto fo = Napi::Object::New(env);
            auto vArr = Napi::Float32Array::New(env, f.vertices.size());
            for (size_t j = 0; j < f.vertices.size(); j++) vArr[j] = f.vertices[j];
            fo.Set("vertices", vArr);
            auto iArr = Napi::Uint32Array::New(env, f.indices.size());
            for (size_t j = 0; j < f.indices.size(); j++) iArr[j] = f.indices[j];
            fo.Set("indices", iArr);
            auto posArr = Napi::Array::New(env, 3);
            posArr[0u] = Napi::Number::New(env, f.position[0]);
            posArr[1u] = Napi::Number::New(env, f.position[1]);
            posArr[2u] = Napi::Number::New(env, f.position[2]);
            fo.Set("position", posArr);
            auto velArr = Napi::Array::New(env, 3);
            velArr[0u] = Napi::Number::New(env, f.velocity[0]);
            velArr[1u] = Napi::Number::New(env, f.velocity[1]);
            velArr[2u] = Napi::Number::New(env, f.velocity[2]);
            fo.Set("velocity", velArr);
            fo.Set("mass",   Napi::Number::New(env, f.mass));
            fo.Set("active", Napi::Boolean::New(env, f.active));
            fragArr[i] = fo;
        }
        result.Set("fragments", fragArr);

        auto defArr = Napi::Array::New(env, fr.deformations.size());
        for (size_t i = 0; i < fr.deformations.size(); i++) {
            const auto& d = fr.deformations[i];
            auto dobj = Napi::Object::New(env);
            dobj.Set("index", Napi::Number::New(env, d.index));
            dobj.Set("dx",    Napi::Number::New(env, d.dx));
            dobj.Set("dy",    Napi::Number::New(env, d.dy));
            dobj.Set("dz",    Napi::Number::New(env, d.dz));
            defArr[i] = dobj;
        }
        result.Set("deformations", defArr);
        return result;
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

Napi::Value StepFragments(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    double dt      = info.Length() >= 1 ? info[0].As<Napi::Number>().DoubleValue() : 0.016;
    double gravity = info.Length() >= 2 ? info[1].As<Napi::Number>().DoubleValue() : 9.81;
    auto states = PhysicsEngine::stepFragments(g_fragments, dt, gravity);
    auto arr = Napi::Array::New(env, states.size());
    for (size_t i = 0; i < states.size(); i++) {
        auto s = Napi::Object::New(env);
        auto posArr = Napi::Array::New(env, 3);
        posArr[0u] = Napi::Number::New(env, states[i].position[0]);
        posArr[1u] = Napi::Number::New(env, states[i].position[1]);
        posArr[2u] = Napi::Number::New(env, states[i].position[2]);
        s.Set("position", posArr);
        auto rotArr = Napi::Array::New(env, 4);
        rotArr[0u] = Napi::Number::New(env, states[i].rotation[0]);
        rotArr[1u] = Napi::Number::New(env, states[i].rotation[1]);
        rotArr[2u] = Napi::Number::New(env, states[i].rotation[2]);
        rotArr[3u] = Napi::Number::New(env, states[i].rotation[3]);
        s.Set("rotation", rotArr);
        s.Set("active", Napi::Boolean::New(env, states[i].active));
        arr[i] = s;
    }
    return arr;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getFallingObjects", Napi::Function::New(env, GetFallingObjects));
    exports.Set("getTargetObjects",  Napi::Function::New(env, GetTargetObjects));
    exports.Set("simulate",          Napi::Function::New(env, Simulate));
    exports.Set("computeFracture",   Napi::Function::New(env, ComputeFracture));
    exports.Set("stepFragments",     Napi::Function::New(env, StepFragments));
    return exports;
}

NODE_API_MODULE(physics, Init)
