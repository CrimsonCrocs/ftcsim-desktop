#include <jni.h>
#include <jvmti.h>
#include <pthread/qos.h>
#include <string.h>

static void JNICALL vm_ready(jvmtiEnv *tooling, JNIEnv *env, jthread thread) {
    pthread_set_qos_class_self_np(QOS_CLASS_USER_INITIATED, 0);
}
static void JNICALL thread_started(jvmtiEnv *tooling, JNIEnv *env, jthread thread) {
    jvmtiThreadInfo info = {0};
    if ((*tooling)->GetThreadInfo(tooling, thread, &info) != JVMTI_ERROR_NONE) return;
    if (info.name && (!strcmp(info.name, "FTC desktop OpMode") || !strcmp(info.name, "ftc-linear-opmode")
        || !strcmp(info.name, "Daemon worker") || !strcmp(info.name, "included builds") || !strncmp(info.name, "Execution worker", 16)))
        pthread_set_qos_class_self_np(QOS_CLASS_USER_INITIATED, 0);
    if (info.name) (*tooling)->Deallocate(tooling, (unsigned char *)info.name);
    if (info.thread_group) (*env)->DeleteLocalRef(env, info.thread_group);
    if (info.context_class_loader) (*env)->DeleteLocalRef(env, info.context_class_loader);
}
JNIEXPORT jint JNICALL Agent_OnLoad(JavaVM *vm, char *options, void *reserved) {
    jvmtiEnv *tooling = NULL;
    if ((*vm)->GetEnv(vm, (void **)&tooling, JVMTI_VERSION_1_2) != JNI_OK) return JNI_ERR;
    jvmtiEventCallbacks callbacks = {0};
    callbacks.VMInit = vm_ready; callbacks.ThreadStart = thread_started;
    if ((*tooling)->SetEventCallbacks(tooling, &callbacks, sizeof(callbacks)) != JVMTI_ERROR_NONE
        || (*tooling)->SetEventNotificationMode(tooling, JVMTI_ENABLE, JVMTI_EVENT_VM_INIT, NULL) != JVMTI_ERROR_NONE
        || (*tooling)->SetEventNotificationMode(tooling, JVMTI_ENABLE, JVMTI_EVENT_THREAD_START, NULL) != JVMTI_ERROR_NONE) return JNI_ERR;
    return JNI_OK;
}

JNIEXPORT jint JNICALL Java_ftc_desktop_WorkPolicy_exchangeNative(JNIEnv *env, jclass type, jint requested) {
    qos_class_t previous = qos_class_self();
    int error = pthread_set_qos_class_self_np((qos_class_t)requested, 0);
    return error ? -error : (jint)previous;
}
JNIEXPORT jint JNICALL Java_ftc_desktop_WorkPolicy_currentNative(JNIEnv *env, jclass type) {
    return (jint)qos_class_self();
}
