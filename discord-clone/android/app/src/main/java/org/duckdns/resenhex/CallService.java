package org.duckdns.resenhex;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Serviço em primeiro plano enquanto a pessoa está numa call, como o "Conectado à voz" do Discord.
 * Com ele, o Android mantém o microfone, a rede e o site rodando com a tela bloqueada.
 * A notificação fixa mostra a sala e tem os botões Silenciar e Sair.
 */
public class CallService extends Service {
    static final String CHANNEL = "call";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_MUTED = "muted";
    private static final String ACTION_MUTE = "org.duckdns.resenhex.MUTE";
    private static final String ACTION_LEAVE = "org.duckdns.resenhex.LEAVE";
    private static final int NOTIFICATION_ID = 1;

    private PowerManager.WakeLock cpu;
    private WifiManager.WifiLock wifi;
    private long startedAt; // o cronômetro da notificação conta desde a entrada na call

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_MUTE.equals(action)) { MainActivity.callAction("mute"); return START_NOT_STICKY; }
        if (ACTION_LEAVE.equals(action)) { MainActivity.callAction("leave"); return START_NOT_STICKY; }

        String title = intent == null ? "" : intent.getStringExtra(EXTRA_TITLE);
        boolean muted = intent != null && intent.getBooleanExtra(EXTRA_MUTED, false);
        if (startedAt == 0) startedAt = System.currentTimeMillis();
        Notification notification = buildNotification(title == null ? "" : title, muted);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        else startForeground(NOTIFICATION_ID, notification);
        holdLocks();
        // Se o Android encerrar o app, a call acabou: não faz sentido o serviço voltar sozinho.
        return START_NOT_STICKY;
    }

    private Notification buildNotification(String title, boolean muted) {
        MainActivity.createChannels(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent mute = PendingIntent.getService(this, 1, new Intent(this, CallService.class).setAction(ACTION_MUTE), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent leave = PendingIntent.getService(this, 2, new Intent(this, CallService.class).setAction(ACTION_LEAVE), PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this).setPriority(Notification.PRIORITY_LOW);
        return builder.setSmallIcon(R.drawable.ic_stat_resenhex)
                .setColor(Color.parseColor("#6B38E8"))
                .setContentTitle(title.isEmpty() ? "Na call" : "Na call · " + title)
                .setContentText(muted ? "Seu microfone está desligado" : "Toque para voltar para a call")
                .setContentIntent(tap)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setWhen(startedAt)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setCategory(Notification.CATEGORY_CALL)
                .setGroup("call") // fica separada das mensagens, com os botões sempre à vista
                .addAction(new Notification.Action.Builder(null, muted ? "Ligar microfone" : "Silenciar", mute).build())
                .addAction(new Notification.Action.Builder(null, "Sair da call", leave).build())
                .build();
    }

    /** Mantém o processador e o Wi-Fi acordados durante a call (com a tela apagada eles dormem). */
    private void holdLocks() {
        if (cpu == null) {
            cpu = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Resenhex:call");
            cpu.setReferenceCounted(false);
            cpu.acquire(6 * 60 * 60 * 1000L); // limite de segurança: 6 horas
        }
        if (wifi == null) {
            WifiManager manager = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifi = manager.createWifiLock(mode, "Resenhex:call");
            wifi.setReferenceCounted(false);
            wifi.acquire();
        }
    }

    @Override
    public void onDestroy() {
        if (cpu != null && cpu.isHeld()) cpu.release();
        if (wifi != null && wifi.isHeld()) wifi.release();
        cpu = null;
        wifi = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
