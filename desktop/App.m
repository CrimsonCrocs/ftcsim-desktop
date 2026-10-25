#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface FTCDesktopApplication : NSObject <NSApplicationDelegate,NSWindowDelegate,NSToolbarDelegate,WKNavigationDelegate,WKScriptMessageHandlerWithReply>
@property NSWindow *window;
@property WKWebView *web;
@property NSURL *base;
@property NSString *token;
@property NSTask *backend;
@property NSFileHandle *log;
@property dispatch_queue_t serviceQueue;
@property BOOL quitting;
@property NSTimer *automationTimer;
@property BOOL pollingAutomation;
@property(strong) id workActivity;
@property(strong) NSDate *workActivityUntil;
@property(strong) NSDate *rendererActivityUntil;
@property NSTextField *projectPath;
@property NSTextField *evaluationSummary;
@property NSButton *evaluateButton;
@property NSLayoutConstraint *projectPathWidth;
@end

@implementation FTCDesktopApplication
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    self.serviceQueue=dispatch_queue_create("FTC Desktop local tools",DISPATCH_QUEUE_SERIAL);
    [self createMenus];
    self.window=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,1440,920) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
    self.window.title=@"FTC Simulator Desktop";self.window.minSize=NSMakeSize(900,600);self.window.delegate=self;
    [self createToolbar];
    [self.window setFrameAutosaveName:@"FTCDesktopMain"];
    WKWebViewConfiguration *configuration=[WKWebViewConfiguration new];
    configuration.preferences.inactiveSchedulingPolicy=WKInactiveSchedulingPolicyNone;
    [configuration.userContentController addScriptMessageHandlerWithReply:self contentWorld:WKContentWorld.pageWorld name:@"desktop"];
    [configuration.userContentController addUserScript:[[WKUserScript alloc] initWithSource:@"window.ftcDesktop={request:(path,body)=>window.webkit.messageHandlers.desktop.postMessage(JSON.parse(JSON.stringify({path,body:body??{}})))};" injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
    self.web=[[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];self.web.navigationDelegate=self;self.web.inspectable=YES;
    self.window.contentView=self.web;[self.window center];[self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];
    [self.web loadHTMLString:@"<html><body style='background:#1e1f22;color:#d4d7dc;font:13px -apple-system;display:grid;place-items:center;height:90vh'>Starting local tools…</body></html>" baseURL:nil];
    NSImage *icon=[[NSImage alloc] initWithContentsOfURL:[NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"AppIcon.png"]];
    NSApp.applicationIconImage=icon?:[NSImage imageWithSystemSymbolName:@"cpu" accessibilityDescription:@"FTC Simulator Desktop"];
    dispatch_async(self.serviceQueue,^{[self startBackend];});
}
- (void)createToolbar {
    self.projectPath=[NSTextField labelWithString:@""];
    self.projectPath.font=[NSFont systemFontOfSize:NSFont.smallSystemFontSize];
    self.projectPath.textColor=NSColor.secondaryLabelColor;
    self.projectPath.lineBreakMode=NSLineBreakByTruncatingMiddle;
    [self.projectPath setAccessibilityLabel:@"Project folder"];
    [self.projectPath setContentCompressionResistancePriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
    [self.projectPath.widthAnchor constraintGreaterThanOrEqualToConstant:100].active=YES;
    self.projectPathWidth=[self.projectPath.widthAnchor constraintLessThanOrEqualToConstant:620];self.projectPathWidth.active=YES;
    NSLayoutConstraint *preferred=[self.projectPath.widthAnchor constraintEqualToConstant:500];preferred.priority=NSLayoutPriorityDefaultLow;preferred.active=YES;
    self.evaluationSummary=[NSTextField labelWithString:@""];
    self.evaluationSummary.font=[NSFont systemFontOfSize:NSFont.smallSystemFontSize];
    self.evaluationSummary.textColor=NSColor.secondaryLabelColor;
    self.evaluationSummary.lineBreakMode=NSLineBreakByTruncatingTail;
    [self.evaluationSummary setAccessibilityLabel:@"Autonomous result"];
    [self.evaluationSummary.widthAnchor constraintLessThanOrEqualToConstant:260].active=YES;
    self.evaluateButton=[NSButton buttonWithTitle:@"Evaluate 30 s" target:self action:@selector(evaluate:)];
    self.evaluateButton.bezelStyle=NSBezelStyleRounded;self.evaluateButton.controlSize=NSControlSizeSmall;self.evaluateButton.enabled=NO;
    self.evaluateButton.toolTip=@"Evaluate 30 simulated seconds (⌘E). Run and Evaluate use rehearsal seed 20261024.";
    [self.evaluateButton setAccessibilityLabel:@"Evaluate 30 seconds"];
    NSToolbar *toolbar=[[NSToolbar alloc] initWithIdentifier:@"FTCDesktopToolbar"];
    toolbar.delegate=self;toolbar.displayMode=NSToolbarDisplayModeIconOnly;toolbar.allowsUserCustomization=NO;
    self.window.toolbarStyle=NSWindowToolbarStyleUnifiedCompact;self.window.toolbar=toolbar;
    [self fitProjectPath];
}
- (void)fitProjectPath {
    CGFloat titleWidth=[self.window.title sizeWithAttributes:@{NSFontAttributeName:[NSFont boldSystemFontOfSize:NSFont.systemFontSize]}].width;
    CGFloat resultWidth=self.evaluationSummary.stringValue.length?self.evaluationSummary.fittingSize.width:0;
    self.projectPathWidth.constant=MAX(100,MIN(620,self.window.frame.size.width-titleWidth-self.evaluateButton.fittingSize.width-resultWidth-150));
}
- (void)windowDidResize:(NSNotification *)notification {[self fitProjectPath];}
- (NSArray<NSToolbarItemIdentifier> *)toolbarDefaultItemIdentifiers:(NSToolbar *)toolbar {
    return @[@"project-path",NSToolbarFlexibleSpaceItemIdentifier,@"evaluate"];
}
- (NSArray<NSToolbarItemIdentifier> *)toolbarAllowedItemIdentifiers:(NSToolbar *)toolbar {
    return @[@"project-path",NSToolbarFlexibleSpaceItemIdentifier,@"evaluation-result",@"evaluate"];
}
- (NSToolbarItem *)toolbar:(NSToolbar *)toolbar itemForItemIdentifier:(NSToolbarItemIdentifier)identifier willBeInsertedIntoToolbar:(BOOL)inserted {
    NSToolbarItem *item=[[NSToolbarItem alloc] initWithItemIdentifier:identifier];item.autovalidates=NO;
    if([identifier isEqual:@"project-path"]){item.label=@"Project folder";item.view=self.projectPath;item.visibilityPriority=NSToolbarItemVisibilityPriorityHigh;}
    else if([identifier isEqual:@"evaluation-result"]){item.label=@"Autonomous result";item.view=self.evaluationSummary;item.visibilityPriority=NSToolbarItemVisibilityPriorityLow;}
    else if([identifier isEqual:@"evaluate"]){item.label=@"Evaluate 30 s";item.view=self.evaluateButton;item.target=self;item.action=@selector(evaluate:);item.visibilityPriority=NSToolbarItemVisibilityPriorityUser;}
    else return nil;
    return item;
}
- (void)updateChrome:(NSDictionary *)body {
    self.projectPath.stringValue=[body[@"directory"] isKindOfClass:NSString.class]?body[@"directory"]:@"";
    self.projectPath.toolTip=self.projectPath.stringValue;
    self.evaluateButton.title=[body[@"busy"] boolValue]?@"Evaluating…":@"Evaluate 30 s";
    self.evaluateButton.enabled=[body[@"ready"] boolValue]&&![body[@"busy"] boolValue];
    self.evaluationSummary.stringValue=[body[@"summary"] isKindOfClass:NSString.class]?body[@"summary"]:@"";
    self.evaluationSummary.toolTip=[body[@"detail"] isKindOfClass:NSString.class]?body[@"detail"]:nil;
    BOOL present=NO;for(NSToolbarItem *item in self.window.toolbar.items)if([item.itemIdentifier isEqual:@"evaluation-result"])present=YES;
    if(self.evaluationSummary.stringValue.length&&!present)[self.window.toolbar insertItemWithItemIdentifier:@"evaluation-result" atIndex:self.window.toolbar.items.count-1];
    else if(!self.evaluationSummary.stringValue.length&&present){NSUInteger index=[self.window.toolbar.items indexOfObjectPassingTest:^BOOL(NSToolbarItem *item,NSUInteger i,BOOL *stop){return [item.itemIdentifier isEqual:@"evaluation-result"];}];[self.window.toolbar removeItemAtIndex:index];}
    [self fitProjectPath];
}
- (void)captureWindow:(void (^)(id,NSString *))reply {
    [self.web takeSnapshotWithConfiguration:nil completionHandler:^(NSImage *image,NSError *failure){
        if(!image){reply(nil,failure.localizedDescription?:@"Could not capture the app view");return;}
        NSView *frame=self.window.contentView.superview;NSRect bounds=frame.bounds;
        NSBitmapImageRep *bitmap=[frame bitmapImageRepForCachingDisplayInRect:bounds];
        if(!bitmap){reply(nil,@"Could not capture the window frame");return;}
        [frame cacheDisplayInRect:bounds toBitmapImageRep:bitmap];
        [NSGraphicsContext saveGraphicsState];[NSGraphicsContext setCurrentContext:[NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap]];
        [image drawInRect:[self.web convertRect:self.web.bounds toView:frame] fromRect:NSZeroRect operation:NSCompositingOperationCopy fraction:1 respectFlipped:YES hints:nil];
        [NSGraphicsContext restoreGraphicsState];
        NSData *png=[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        reply(png?@{@"base64":[png base64EncodedStringWithOptions:0],@"mimeType":@"image/png"}:nil,png?nil:@"Could not encode the app view");
    }];
}
- (void)startBackend {
    @autoreleasepool {
        NSError *error=nil;NSFileManager *files=NSFileManager.defaultManager;NSURL *resources=NSBundle.mainBundle.resourceURL;
        NSURL *support=[files URLForDirectory:NSApplicationSupportDirectory inDomain:NSUserDomainMask appropriateForURL:nil create:YES error:&error];
        NSURL *data=[support URLByAppendingPathComponent:@"FTC Simulator Desktop" isDirectory:YES];
        if(![files createDirectoryAtURL:data withIntermediateDirectories:YES attributes:nil error:&error]){[self report:error.localizedDescription];return;}
        NSURL *project=[data URLByAppendingPathComponent:@"Projects/Red Pollen Auto" isDirectory:YES];
        if(![files fileExistsAtPath:project.path]){
            [files createDirectoryAtURL:project.URLByDeletingLastPathComponent withIntermediateDirectories:YES attributes:nil error:&error];
            if(![files copyItemAtURL:[resources URLByAppendingPathComponent:@"initial-project"] toURL:project error:&error]){[self report:error.localizedDescription];return;}
        }
        NSString *key=[NSUUID.UUID.UUIDString stringByAppendingString:NSUUID.UUID.UUIDString];
        NSURL *connectionFile=[data URLByAppendingPathComponent:@"connection.json"],*logURL=[data URLByAppendingPathComponent:@"desktop.log"];
        [files createFileAtPath:logURL.path contents:nil attributes:nil];self.log=[NSFileHandle fileHandleForWritingToURL:logURL error:&error];
        if(!self.log){[self report:error.localizedDescription];return;}
        NSString *java=[[resources URLByAppendingPathComponent:@"toolchains/java"] path];
        NSMutableDictionary *environment=[NSMutableDictionary new];NSDictionary *inherited=NSProcessInfo.processInfo.environment;
        for(NSString *name in @[@"HOME",@"USER",@"TMPDIR",@"LANG",@"LC_ALL"])if(inherited[name])environment[name]=inherited[name];
        environment[@"PATH"]=[java stringByAppendingString:@"/bin:/usr/bin:/bin:/opt/homebrew/bin"];
        environment[@"JAVA_HOME"]=java;environment[@"FTC_DESKTOP_JAVA"]=[java stringByAppendingString:@"/bin/java"];
        environment[@"FTC_DESKTOP_RESOURCE_ROOT"]=resources.path;
        environment[@"FTC_DESKTOP_HOST_CLASSES"]=[[resources URLByAppendingPathComponent:@"desktop/host"] path];
        environment[@"FTC_DESKTOP_GRADLE"]=[[resources URLByAppendingPathComponent:@"toolchains/gradle/bin/gradle"] path];
        environment[@"FTC_DESKTOP_PROJECT"]=project.path;
        environment[@"FTC_DESKTOP_PROJECTS_DIRECTORY"]=[[data URLByAppendingPathComponent:@"Projects"] path];
        environment[@"FTC_DESKTOP_CONNECTION_FILE"]=connectionFile.path;environment[@"FTC_DESKTOP_TOKEN"]=key;
        environment[@"JAVA_RUNNER_FTC_SDK_HOME"]=[[resources URLByAppendingPathComponent:@"services/java-runner/.runtime/ftc-sdk-11.1.0"] path];
        environment[@"JAVA_RUNNER_ANDROID_JAR"]=[[resources URLByAppendingPathComponent:@"services/java-runner/.runtime/android-sdk/platforms/android-30/android.jar"] path];
        environment[@"JAVA_RUNNER_KOTLIN_HOME"]=[[resources URLByAppendingPathComponent:@"services/java-runner/.runtime/kotlin-2.2.10"] path];
        NSTask *process=[NSTask new];process.executableURL=[NSURL fileURLWithPath:@"/usr/sbin/taskpolicy"];
        process.qualityOfService=NSQualityOfServiceUserInitiated;
        process.arguments=@[@"-a",[[resources URLByAppendingPathComponent:@"bin/bun"] path],[[resources URLByAppendingPathComponent:@"desktop/backend.js"] path]];process.currentDirectoryURL=resources;
        process.environment=environment;process.standardOutput=self.log;process.standardError=self.log;
        if(![process launchAndReturnError:&error]){[self report:error.localizedDescription];return;}self.backend=process;
        for(int i=0;i<240;i++){
            if(!process.running){[self report:[@"The local tools stopped. See " stringByAppendingString:logURL.path]];return;}
            NSData *contents=[NSData dataWithContentsOfURL:connectionFile];
            NSDictionary *connection=contents?[NSJSONSerialization JSONObjectWithData:contents options:0 error:nil]:nil;
            if([connection[@"token"] isEqual:key] && [connection[@"port"] isKindOfClass:NSNumber.class]){
                NSURL *base=[NSURL URLWithString:[NSString stringWithFormat:@"http://127.0.0.1:%@",connection[@"port"]]];
                dispatch_async(dispatch_get_main_queue(),^{self.base=base;self.token=key;[self.web loadRequest:[NSURLRequest requestWithURL:base]];
                    self.automationTimer=[NSTimer timerWithTimeInterval:0.25 target:self selector:@selector(pollAutomation:) userInfo:nil repeats:YES];
                    [NSRunLoop.mainRunLoop addTimer:self.automationTimer forMode:NSRunLoopCommonModes];});return;
            }
            [NSThread sleepForTimeInterval:0.05];
        }
        [process terminate];[self report:[@"Local tools did not start within 12 seconds. See " stringByAppendingString:logURL.path]];
    }
}
- (NSMutableURLRequest *)automationRequest:(NSString *)path body:(id)body {
    NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:[self.base URLByAppendingPathComponent:[@"desktop" stringByAppendingString:path]]];
    request.HTTPMethod=@"POST";request.timeoutInterval=15;
    request.HTTPBody=[NSJSONSerialization dataWithJSONObject:body options:0 error:nil];
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    [request setValue:[@"Bearer " stringByAppendingString:self.token] forHTTPHeaderField:@"Authorization"];
    return request;
}
- (void)completeAutomation:(NSDictionary *)command result:(id)result error:(NSString *)error after:(void (^)(void))after {
    NSMutableDictionary *body=[@{@"id":command[@"id"]} mutableCopy];
    if(error)body[@"error"]=error;else body[@"result"]=result?:NSNull.null;
    [[[NSURLSession sharedSession] dataTaskWithRequest:[self automationRequest:@"/automation/complete" body:body] completionHandler:^(NSData *data,NSURLResponse *response,NSError *failure){if(after)dispatch_async(dispatch_get_main_queue(),after);}] resume];
}
- (void)setWorkActive:(BOOL)active {
    if(active){
        self.workActivityUntil=[NSDate dateWithTimeIntervalSinceNow:30];
        if(!self.workActivity)self.workActivity=[NSProcessInfo.processInfo beginActivityWithOptions:NSActivityUserInitiated reason:@"Build and evaluate FTC autonomous"];
    }else{
        if(self.workActivity)[NSProcessInfo.processInfo endActivity:self.workActivity];
        self.workActivity=nil;self.workActivityUntil=nil;
    }
}
- (void)pollAutomation:(NSTimer *)timer {
    if(self.workActivity&&self.workActivityUntil.timeIntervalSinceNow<0)[self setWorkActive:NO];
    if(self.quitting||self.pollingAutomation||!self.base)return;
    self.pollingAutomation=YES;
    [[[NSURLSession sharedSession] dataTaskWithRequest:[self automationRequest:@"/automation/poll" body:@{}] completionHandler:^(NSData *data,NSURLResponse *response,NSError *error){
        id command=data?[NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingFragmentsAllowed error:nil]:nil;
        dispatch_async(dispatch_get_main_queue(),^{
            self.pollingAutomation=NO;
            if(![command isKindOfClass:NSDictionary.class])return;
            [self setWorkActive:[command[@"activeWork"] boolValue]||self.rendererActivityUntil.timeIntervalSinceNow>0];
            if(![command[@"id"] isKindOfClass:NSString.class])return;
            NSString *action=command[@"action"];
            if([action isEqual:@"snapshot"]){
                [self captureWindow:^(id result,NSString *error){[self completeAutomation:command result:result error:error after:nil];}];return;
            }
            if([action isEqual:@"evaluate"]){if(!self.evaluateButton.enabled){[self completeAutomation:command result:nil error:@"Evaluation is unavailable or already running" after:nil];return;}[self.evaluateButton performClick:nil];[self completeAutomation:command result:@{@"requested":@"evaluate"} error:nil after:nil];return;}
            if([action isEqual:@"resize"]){
                NSDictionary *args=command[@"args"];NSNumber *width=args[@"width"],*height=args[@"height"];
                if(![width isKindOfClass:NSNumber.class]||![height isKindOfClass:NSNumber.class]||width.doubleValue<900||height.doubleValue<600||width.doubleValue>4096||height.doubleValue>4096){[self completeAutomation:command result:nil error:@"Window size must be 900–4096 by 600–4096 points" after:nil];return;}
                NSRect frame=self.window.frame;frame.origin.y+=frame.size.height-height.doubleValue;frame.size=NSMakeSize(width.doubleValue,height.doubleValue);[self.window setFrame:frame display:YES];
                [self completeAutomation:command result:@{@"width":@(self.window.frame.size.width),@"height":@(self.window.frame.size.height)} error:nil after:nil];return;
            }
            if([action isEqual:@"show"]){[self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];[self completeAutomation:command result:@{@"shown":@YES} error:nil after:nil];return;}
            if([action isEqual:@"hide"]){[NSApp hide:nil];[self completeAutomation:command result:@{@"hidden":@YES} error:nil after:nil];return;}
            if([action isEqual:@"run"]||[action isEqual:@"edit"]){[self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];}
            BOOL reload=[action isEqual:@"reload"],quit=[action isEqual:@"quit"];
            NSString *script=reload||quit?@"await window.__ftcDesktopControl?.('stop',{});await window.__ftcDesktopDrain?.();return {saved:true};":@"if(!window.__ftcDesktopControl)throw new Error('Editor is still opening');return await window.__ftcDesktopControl(action,args);";
            [self.web callAsyncJavaScript:script arguments:@{@"action":action,@"args":command[@"args"]?:@{}} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result,NSError *failure){
                if([action isEqual:@"status"]&&[result isKindOfClass:NSDictionary.class]){
                    NSMutableDictionary *state=[result mutableCopy];state[@"nativeWorkActive"]=@(self.workActivity!=nil);state[@"windowVisible"]=@(self.window.visible&&!NSApp.hidden);
                    state[@"nativeActive"]=@(NSApp.active);state[@"nativeOcclusionVisible"]=@((self.window.occlusionState&NSWindowOcclusionStateVisible)!=0);
                    state[@"windowSize"]=@{@"width":@(self.window.frame.size.width),@"height":@(self.window.frame.size.height)};
                    state[@"toolbar"]=@{@"projectPath":self.projectPath.stringValue,@"evaluation":self.evaluationSummary.stringValue,@"evaluationDetail":self.evaluationSummary.toolTip?:@"",@"evaluateEnabled":@(self.evaluateButton.enabled),@"evaluateTitle":self.evaluateButton.title,@"visibleItems":[self.window.toolbar.visibleItems valueForKey:@"itemIdentifier"]?:@[]};result=state;
                }
                [self completeAutomation:command result:result error:failure.localizedDescription after:^{
                    if(failure)return;
                    if(reload)[self.web reload];
                    if(quit)[NSApp performSelector:@selector(terminate:) withObject:nil afterDelay:0];
                }];
            }];
        });
    }] resume];
}
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message replyHandler:(void (^)(id,NSString *))reply {
    NSDictionary *payload=[message.body isKindOfClass:NSDictionary.class]?message.body:nil;
    NSString *path=[payload[@"path"] isKindOfClass:NSString.class]?payload[@"path"]:nil;
    NSURL *origin=message.frameInfo.request.URL;
    if(!message.frameInfo.mainFrame || !self.base || ![origin.host isEqual:@"127.0.0.1"] || ![origin.port isEqual:self.base.port] || ![path hasPrefix:@"/"] || [path containsString:@".."] || [path containsString:@"?"]){reply(nil,@"Invalid desktop request");return;}
    if([path isEqual:@"/native/show"]){[self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];reply(@{@"shown":@YES},nil);return;}
    if([path isEqual:@"/native/chrome"]){[self updateChrome:[payload[@"body"] isKindOfClass:NSDictionary.class]?payload[@"body"]:@{}];reply(@{@"updated":@YES},nil);return;}
    if([path isEqual:@"/native/activity"]){NSDictionary *body=[payload[@"body"] isKindOfClass:NSDictionary.class]?payload[@"body"]:@{};self.rendererActivityUntil=[body[@"active"] boolValue]?[NSDate dateWithTimeIntervalSinceNow:30]:nil;reply(@{@"updated":@YES},nil);return;}
    if([path isEqual:@"/native/quit"]){reply(@{@"quitting":@YES},nil);[NSApp performSelector:@selector(terminate:) withObject:nil afterDelay:0];return;}
    if([path isEqual:@"/native/snapshot"]){
        [self captureWindow:reply];return;
    }
    NSError *error=nil;id body=[payload[@"body"] isKindOfClass:NSDictionary.class]?payload[@"body"]:@{};
    NSData *data=[NSJSONSerialization dataWithJSONObject:body options:0 error:&error];if(!data){reply(nil,error.localizedDescription);return;}
    NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:[self.base URLByAppendingPathComponent:[@"desktop" stringByAppendingString:path]]];
    request.HTTPMethod=@"POST";request.HTTPBody=data;request.timeoutInterval=720;
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];[request setValue:[@"Bearer " stringByAppendingString:self.token] forHTTPHeaderField:@"Authorization"];
    [[[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *bytes,NSURLResponse *response,NSError *failure){
        NSError *decode=nil;id json=bytes?[NSJSONSerialization JSONObjectWithData:bytes options:NSJSONReadingFragmentsAllowed error:&decode]:nil;
        NSString *reason=failure.localizedDescription?:decode.localizedDescription;
        if([(NSHTTPURLResponse *)response statusCode]!=200 && !reason && !([json isKindOfClass:NSDictionary.class]&&[json[@"error"] isKindOfClass:NSString.class]))reason=@"Local operation failed";
        dispatch_async(dispatch_get_main_queue(),^{reply(reason?nil:json,reason);});
    }] resume];
}
- (void)webView:(WKWebView *)web decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decide {
    NSURL *url=action.request.URL;
    if([url.scheme isEqual:@"about"] || ([url.host isEqual:@"127.0.0.1"]&&[url.port isEqual:self.base.port]))decide(WKNavigationActionPolicyAllow);
    else{decide(WKNavigationActionPolicyCancel);if([@[@"http",@"https"] containsObject:url.scheme])[NSWorkspace.sharedWorkspace openURL:url];}
}
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)web{self.rendererActivityUntil=nil;[self setWorkActive:NO];[self report:@"The editor process stopped. Reload Project to reopen saved files."];}
- (BOOL)windowShouldClose:(NSWindow *)sender{[NSApp terminate:nil];return NO;}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
    if(self.quitting)return NSTerminateLater;self.quitting=YES;
    [self setWorkActive:NO];
    [self.web callAsyncJavaScript:@"await window.__ftcDesktopDrain?.();return true" arguments:@{} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result,NSError *error){
        if(error){NSAlert *alert=[NSAlert new];alert.messageText=@"Project could not be saved";alert.informativeText=error.localizedDescription;[alert addButtonWithTitle:@"Return to Project"];[alert addButtonWithTitle:@"Quit Without Saving"];
            if([alert runModal]==NSAlertFirstButtonReturn){self.quitting=NO;[sender replyToApplicationShouldTerminate:NO];return;}}
        NSMutableURLRequest *request=self.base?[NSMutableURLRequest requestWithURL:[self.base URLByAppendingPathComponent:@"desktop/shutdown"]]:nil;
        if(!request){dispatch_async(self.serviceQueue,^{if(self.backend.running)[self.backend terminate];[self performSelectorOnMainThread:@selector(finishTermination:) withObject:sender waitUntilDone:NO];});return;}
        request.HTTPMethod=@"POST";request.HTTPBody=[@"{}" dataUsingEncoding:NSUTF8StringEncoding];request.timeoutInterval=4;
        [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];[request setValue:[@"Bearer " stringByAppendingString:self.token] forHTTPHeaderField:@"Authorization"];
        [[[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data,NSURLResponse *response,NSError *error){dispatch_async(self.serviceQueue,^{if(self.backend.running)[self.backend terminate];[self performSelectorOnMainThread:@selector(finishTermination:) withObject:sender waitUntilDone:NO];});}] resume];
    }];return NSTerminateLater;
}
- (void)finishTermination:(NSApplication *)application{[application replyToApplicationShouldTerminate:YES];}
- (void)reloadProject:(id)sender{[self.web callAsyncJavaScript:@"await window.__ftcDesktopDrain?.();return true" arguments:@{} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result,NSError *error){if(error)[self report:error.localizedDescription];else[self.web reload];}];}
- (void)evaluate:(id)sender{[self.web evaluateJavaScript:@"window.dispatchEvent(new Event('ftc-desktop-evaluate'))" completionHandler:^(id result,NSError *error){if(error)[self report:error.localizedDescription];}];}
- (void)openProject:(id)sender{
    NSOpenPanel *panel=[NSOpenPanel openPanel];panel.canChooseDirectories=YES;panel.canChooseFiles=NO;panel.allowsMultipleSelection=NO;panel.prompt=@"Open Project";
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response){if(response!=NSModalResponseOK)return;
        [self.web callAsyncJavaScript:@"await window.__ftcDesktopDrain?.();const result=await window.ftcDesktop.request('/workspace/open',body);if(result?.error)throw new Error(result.error);location.href='/';" arguments:@{@"body":@{@"directory":panel.URL.path}} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result,NSError *error){if(error)[self report:error.localizedDescription];}];
    }];
}
- (void)report:(NSString *)message{dispatch_async(dispatch_get_main_queue(),^{NSAlert *alert=[NSAlert new];alert.messageText=@"FTC Simulator Desktop";alert.informativeText=message?:@"Local operation failed";[alert addButtonWithTitle:@"OK"];[alert beginSheetModalForWindow:self.window completionHandler:nil];});}
- (void)createMenus {
    NSMenu *bar=[NSMenu new],*application=[NSMenu new];
    [application addItemWithTitle:@"About FTC Simulator Desktop" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [application addItem:NSMenuItem.separatorItem];[application addItemWithTitle:@"Quit FTC Simulator Desktop" action:@selector(terminate:) keyEquivalent:@"q"];
    NSMenuItem *appItem=[NSMenuItem new];appItem.submenu=application;[bar addItem:appItem];
    NSMenu *file=[[NSMenu alloc] initWithTitle:@"File"];NSMenuItem *open=[file addItemWithTitle:@"Open Project…" action:@selector(openProject:) keyEquivalent:@"o"];open.target=self;
    NSMenuItem *fileItem=[[NSMenuItem alloc] initWithTitle:@"File" action:NULL keyEquivalent:@""];fileItem.submenu=file;[bar addItem:fileItem];
    NSMenu *edit=[[NSMenu alloc] initWithTitle:@"Edit"];
    for(NSArray *item in @[@[@"Undo",@"z",@"undo:"],@[@"Cut",@"x",@"cut:"],@[@"Copy",@"c",@"copy:"],@[@"Paste",@"v",@"paste:"],@[@"Select All",@"a",@"selectAll:"]]) [edit addItemWithTitle:item[0] action:NSSelectorFromString(item[2]) keyEquivalent:item[1]];
    NSMenuItem *editItem=[[NSMenuItem alloc] initWithTitle:@"Edit" action:NULL keyEquivalent:@""];editItem.submenu=edit;[bar addItem:editItem];
    NSMenu *view=[[NSMenu alloc] initWithTitle:@"View"];NSMenuItem *reload=[view addItemWithTitle:@"Reload Project" action:@selector(reloadProject:) keyEquivalent:@"r"];reload.target=self;
    NSMenuItem *evaluate=[view addItemWithTitle:@"Evaluate Autonomous" action:@selector(evaluate:) keyEquivalent:@"e"];evaluate.target=self;
    NSMenuItem *viewItem=[[NSMenuItem alloc] initWithTitle:@"View" action:NULL keyEquivalent:@""];viewItem.submenu=view;[bar addItem:viewItem];NSApp.mainMenu=bar;
}
@end

int main(int argc,const char *argv[]){@autoreleasepool{NSApplication *app=NSApplication.sharedApplication;FTCDesktopApplication *delegate=[FTCDesktopApplication new];app.delegate=delegate;[app run];return 0;}}
