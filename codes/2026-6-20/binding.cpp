#include <napi.h>
#include "physics.h"
#include <stdexcept>

// ─────────────────────────────────────────────
//  헬퍼: C++ 구조체 → JS 객체 변환
// ─────────────────────────────────────────────

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
    return o;
}

// ─────────────────────────────────────────────
//  JS에서 호출할 함수들
// ─────────────────────────────────────────────

// getPresetFallingObjects() → Array
Napi::Value GetFallingObjects(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto list = PhysicsEngine::getPresetFallingObjects();
    auto arr  = Napi::Array::New(env, list.size());
    for (size_t i = 0; i < list.size(); i++)
        arr[i] = FallingObjectToJS(env, list[i]);
    return arr;
}

// getPresetTargetObjects() → Array
Napi::Value GetTargetObjects(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto list = PhysicsEngine::getPresetTargetObjects();
    auto arr  = Napi::Array::New(env, list.size());
    for (size_t i = 0; i < list.size(); i++)
        arr[i] = TargetObjectToJS(env, list[i]);
    return arr;
}

// simulate(input: object) → result object
// input = {
//   falling: { name, mass, cd, area, radius },
//   target:  { name, yieldStrength, thickness },
//   height:  number,
//   airDensity?: number,
//   gravity?:    number
// }
Napi::Value Simulate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "인자로 객체를 넘겨주세요.").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object inp = info[0].As<Napi::Object>();

    try {
        // ── 낙하 물체 파싱 ──
        Napi::Object fObj = inp.Get("falling").As<Napi::Object>();
        FallingObject falling;
        falling.name   = fObj.Get("name").As<Napi::String>().Utf8Value();
        falling.mass   = fObj.Get("mass").As<Napi::Number>().DoubleValue();
        falling.cd     = fObj.Get("cd").As<Napi::Number>().DoubleValue();
        falling.area   = fObj.Get("area").As<Napi::Number>().DoubleValue();
        falling.radius = fObj.Get("radius").As<Napi::Number>().DoubleValue();

        // ── 충돌 대상 파싱 ──
        Napi::Object tObj = inp.Get("target").As<Napi::Object>();
        TargetObject target;
        target.name          = tObj.Get("name").As<Napi::String>().Utf8Value();
        target.yieldStrength = tObj.Get("yieldStrength").As<Napi::Number>().DoubleValue();
        target.thickness     = tObj.Get("thickness").As<Napi::Number>().DoubleValue();

        // ── 시뮬레이션 파라미터 ──
        SimInput simInput;
        simInput.falling    = falling;
        simInput.target     = target;
        simInput.height     = inp.Get("height").As<Napi::Number>().DoubleValue();
        simInput.airDensity = inp.Has("airDensity")
                              ? inp.Get("airDensity").As<Napi::Number>().DoubleValue()
                              : 1.225;
        simInput.gravity    = inp.Has("gravity")
                              ? inp.Get("gravity").As<Napi::Number>().DoubleValue()
                              : 9.81;

        // ── 시뮬레이션 실행 ──
        ImpactResult res = PhysicsEngine::simulate(simInput);

        // ── 결과를 JS 객체로 변환 ──
        auto result = Napi::Object::New(env);
        result.Set("terminalVelocity", Napi::Number::New(env, res.terminalVelocity));
        result.Set("impactVelocity",   Napi::Number::New(env, res.impactVelocity));
        result.Set("impactMomentum",   Napi::Number::New(env, res.impactMomentum));
        result.Set("impactForce",      Napi::Number::New(env, res.impactForce));
        result.Set("impactPressure",   Napi::Number::New(env, res.impactPressure));
        result.Set("destructionRatio", Napi::Number::New(env, res.destructionRatio));
        result.Set("destructionLevel", Napi::String::New(env, res.destructionLevel));

        // trajectory: 프레임 수가 많으면 100개로 샘플링해서 전달 (UI 애니메이션 용도)
        const auto& traj = res.trajectory;
        size_t step = std::max((size_t)1, traj.size() / 100);
        auto trajArr = Napi::Array::New(env);
        uint32_t idx = 0;
        for (size_t i = 0; i < traj.size(); i += step) {
            auto frame = Napi::Object::New(env);
            frame.Set("time",      Napi::Number::New(env, traj[i].time));
            frame.Set("velocity",  Napi::Number::New(env, traj[i].velocity));
            frame.Set("altitude",  Napi::Number::New(env, traj[i].altitude));
            frame.Set("dragForce", Napi::Number::New(env, traj[i].dragForce));
            frame.Set("netForce",  Napi::Number::New(env, traj[i].netForce));
            trajArr[idx++] = frame;
        }
        result.Set("trajectory", trajArr);

        return result;

    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

// ─────────────────────────────────────────────
//  모듈 등록
// ─────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getFallingObjects", Napi::Function::New(env, GetFallingObjects));
    exports.Set("getTargetObjects",  Napi::Function::New(env, GetTargetObjects));
    exports.Set("simulate",          Napi::Function::New(env, Simulate));
    return exports;
}

NODE_API_MODULE(physics, Init)
