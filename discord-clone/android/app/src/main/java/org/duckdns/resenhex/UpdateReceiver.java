package org.duckdns.resenhex;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.graphics.Color;
import android.os.Build;

/**
 * Respostas do instalador do Android para a atualização pedida pelo Updater, e o aviso
 * "Resenhex atualizado" depois que a versão nova entra (o app é fechado durante a instalação).
 * Este receptor é privado (só o instalador, pelo PendingIntent, chega nele); o aviso pós-atualização
 * fica em Replaced, que é público mas só reage ao MY_PACKAGE_REPLACED, que só o sistema envia.
 */
public class UpdateReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // O Android quer a confirmação da pessoa (ou liberar "instalar apps desta fonte" na primeira vez).
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } else if (status != PackageInstaller.STATUS_SUCCESS && status != PackageInstaller.STATUS_FAILURE_ABORTED) {
            Updater.failed(MainActivity.current(), "O Android não instalou a atualização. Tente de novo ou baixe pela página resenhex.duckdns.org/baixar.");
        }
    }

    public static class Replaced extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) notifyUpdated(context);
        }
    }

    private static void notifyUpdated(Context context) {
        MainActivity.createChannels(context);
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open == null) return;
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, MainActivity.CHANNEL_UPDATES)
                : new Notification.Builder(context).setPriority(Notification.PRIORITY_HIGH);
        Notification notification = builder.setSmallIcon(R.drawable.ic_stat_resenhex)
                .setColor(Color.parseColor("#6B38E8"))
                .setContentTitle("Resenhex atualizado")
                .setContentText("Versão " + BuildConfig.VERSION_NAME + " instalada. Toque para abrir.")
                .setContentIntent(tap)
                .setAutoCancel(true)
                .build();
        context.getSystemService(NotificationManager.class).notify("updated", 0, notification);
    }
}
