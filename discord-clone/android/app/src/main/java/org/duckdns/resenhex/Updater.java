package org.duckdns.resenhex;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

/**
 * Atualização do app sem passar pelo site: consulta /download/info (o mesmo que a página /baixar usa),
 * e, havendo APK mais novo, mostra "Atualizar". O APK é baixado direto para o instalador do Android.
 * O Android só aceita a atualização se ela for assinada com a mesma chave do app instalado.
 */
class Updater {
    private static final long CHECK_EVERY_MS = 30 * 60 * 1000L;

    private final MainActivity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private long lastCheck;
    private String dismissed; // "Depois" vale até o app ser aberto de novo
    private boolean busy;
    private String[] waitingPermission; // versão e endereço esperando a pessoa liberar "instalar desta fonte"

    Updater(MainActivity activity) {
        this.activity = activity;
    }

    /** Ao abrir o app e ao voltar para ele (no máximo a cada 30 minutos). */
    void checkSoon() {
        if (busy || SystemClock.elapsedRealtime() - lastCheck < CHECK_EVERY_MS && lastCheck != 0) return;
        lastCheck = SystemClock.elapsedRealtime();
        new Thread(() -> {
            try {
                JSONObject android = new JSONObject(readText(MainActivity.HOME + "download/info")).optJSONObject("android");
                if (android == null) return;
                String version = android.getString("version");
                String url = new URL(new URL(MainActivity.HOME), android.getString("url")).toString();
                long size = android.optLong("size", 0);
                if (isNewer(version, BuildConfig.VERSION_NAME)) main.post(() -> offer(version, url, size));
            } catch (Exception ignored) {
                // Sem internet ou servidor fora: tenta de novo na próxima vez.
            }
        }, "resenhex-update-check").start();
    }

    /** Deixa a próxima volta ao app checar de novo (por exemplo, ao sair de uma call). */
    void allowCheck() {
        lastCheck = 0;
    }

    private void offer(String version, String url, long size) {
        if (busy || version.equals(dismissed) || activity.isFinishing() || activity.isInCall()) {
            if (activity.isInCall()) lastCheck = 0; // durante a call não interrompe: oferece quando ela acabar
            return;
        }
        String mb = size > 0 ? String.format(new Locale("pt", "BR"), " (%.1f MB)", size / 1048576.0) : "";
        new AlertDialog.Builder(activity)
                .setTitle("Atualização do app")
                .setMessage("A versão " + version + " do app Resenhex está pronta" + mb + ". "
                        + "Toque em Atualizar: o app fecha por alguns segundos e avisa quando estiver pronto para abrir de novo.")
                .setPositiveButton("Atualizar", (dialog, which) -> start(version, url))
                .setNegativeButton("Depois", (dialog, which) -> dismissed = version)
                .setOnCancelListener(dialog -> dismissed = version)
                .show();
    }

    // ---------------- download e instalação ----------------

    /**
     * Na primeira atualização, o Android exige liberar o Resenhex como fonte de apps. O app explica,
     * abre a tela certa e, quando a pessoa volta com a chave ligada, continua sozinho (resume()).
     */
    private void start(String version, String url) {
        if (Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls()) {
            install(version, url);
            return;
        }
        new AlertDialog.Builder(activity)
                .setTitle("Só na primeira vez")
                .setMessage("O Android precisa da sua permissão para o Resenhex instalar as próprias atualizações. "
                        + "Na tela a seguir, ative “Permitir desta fonte” e volte: a atualização continua sozinha.")
                .setPositiveButton("Continuar", (dialog, which) -> {
                    waitingPermission = new String[]{version, url};
                    activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
                })
                .setNegativeButton("Agora não", (dialog, which) -> dismissed = version)
                .show();
    }

    /** Ao voltar para o app: se a pessoa liberou a instalação, segue com a atualização. */
    void resume() {
        if (waitingPermission == null || Build.VERSION.SDK_INT < 26) return;
        String[] pending = waitingPermission;
        waitingPermission = null;
        if (activity.getPackageManager().canRequestPackageInstalls()) install(pending[0], pending[1]);
        else dismissed = pending[0];
    }

    private void install(String version, String url) {
        busy = true;
        ProgressBar bar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setIndeterminate(true);
        TextView label = new TextView(activity);
        label.setText("Baixando a versão " + version + "…");
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (24 * activity.getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView(label);
        box.addView(bar);
        AlertDialog progress = new AlertDialog.Builder(activity).setTitle("Atualizando o app").setView(box).setCancelable(false).show();

        new Thread(() -> {
            PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
            int sessionId = -1;
            try {
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(activity.getPackageName());
                // Android 12+: quando o próprio app se atualiza, dá para pular a confirmação.
                if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                sessionId = installer.createSession(params);
                try (PackageInstaller.Session session = installer.openSession(sessionId)) {
                    HttpURLConnection connection = open(url);
                    long total = connection.getContentLengthLong();
                    try (InputStream in = connection.getInputStream(); OutputStream out = session.openWrite("resenhex.apk", 0, total > 0 ? total : -1)) {
                        byte[] buffer = new byte[64 * 1024];
                        long done = 0;
                        int lastPercent = -1;
                        for (int n; (n = in.read(buffer)) > 0; ) {
                            out.write(buffer, 0, n);
                            done += n;
                            int percent = total > 0 ? (int) (done * 100 / total) : -1;
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                main.post(() -> {
                                    bar.setIndeterminate(percent < 0);
                                    if (percent >= 0) bar.setProgress(percent);
                                });
                            }
                        }
                        session.fsync(out);
                    } finally {
                        connection.disconnect();
                    }
                    main.post(() -> label.setText("Instalando…"));
                    Intent result = new Intent(activity, UpdateReceiver.class);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    session.commit(PendingIntent.getBroadcast(activity, sessionId, result, flags).getIntentSender());
                }
                main.postDelayed(() -> { if (progress.isShowing()) progress.dismiss(); busy = false; }, 1500);
            } catch (Exception e) {
                if (sessionId != -1) try { installer.abandonSession(sessionId); } catch (Exception ignored) { }
                main.post(() -> {
                    progress.dismiss();
                    busy = false;
                    failed(activity, "Não deu para baixar a atualização. Confira a internet e tente de novo.");
                });
            }
        }, "resenhex-update").start();
    }

    static void failed(Activity activity, String message) {
        if (activity == null || activity.isFinishing()) return;
        new AlertDialog.Builder(activity).setTitle("Atualização do app").setMessage(message).setPositiveButton("OK", null).show();
    }

    // ---------------- utilidades ----------------

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("Cache-Control", "no-cache");
        connection.setInstanceFollowRedirects(true);
        if (connection.getResponseCode() != 200) throw new Exception("HTTP " + connection.getResponseCode());
        return connection;
    }

    private static String readText(String url) throws Exception {
        HttpURLConnection connection = open(url);
        try (InputStream in = connection.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        } finally {
            connection.disconnect();
        }
    }

    /** "1.10.0" é mais nova que "1.9.3": compara número por número. */
    static boolean isNewer(String candidate, String current) {
        String[] a = candidate.split("\\.");
        String[] b = current.split("\\.");
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            int x = i < a.length ? parse(a[i]) : 0;
            int y = i < b.length ? parse(b[i]) : 0;
            if (x != y) return x > y;
        }
        return false;
    }

    private static int parse(String part) {
        try {
            return Integer.parseInt(part.replaceAll("\\D.*", ""));
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
