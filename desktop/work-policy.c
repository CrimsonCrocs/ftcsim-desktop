#include <node_api.h>
#include <pthread/qos.h>

// This changes only the calling evaluator thread. Restore its previous class
// after the user-requested job; no other app or process is reprioritized.
static napi_value set_qos(napi_env env, napi_callback_info info) {
    size_t count = 1; napi_value argument, result; uint32_t requested;
    if (napi_get_cb_info(env, info, &count, &argument, NULL, NULL) != napi_ok || count != 1
        || napi_get_value_uint32(env, argument, &requested) != napi_ok) {
        napi_throw_type_error(env, NULL, "Expected a thread QoS class"); return NULL;
    }
    if (requested != QOS_CLASS_UNSPECIFIED && requested != QOS_CLASS_BACKGROUND
        && requested != QOS_CLASS_UTILITY && requested != QOS_CLASS_DEFAULT
        && requested != QOS_CLASS_USER_INITIATED && requested != QOS_CLASS_USER_INTERACTIVE) {
        napi_throw_range_error(env, NULL, "Invalid thread QoS class"); return NULL;
    }
    qos_class_t previous = qos_class_self();
    if (pthread_set_qos_class_self_np((qos_class_t)requested, 0) != 0) {
        napi_throw_error(env, NULL, "Could not set evaluator thread QoS"); return NULL;
    }
    napi_create_uint32(env, previous, &result); return result;
}

NAPI_MODULE_INIT() {
    napi_value function;
    napi_create_function(env, "setQoS", NAPI_AUTO_LENGTH, set_qos, NULL, &function);
    napi_set_named_property(env, exports, "setQoS", function); return exports;
}
