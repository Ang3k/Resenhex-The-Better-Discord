# Libera as portas do retransmissor (coturn) na lista de segurança da Oracle, pela API (chave em ~/.oci).
# O deploy/instalar-vps.sh cuida do iptables do servidor; a lista de segurança fica fora dele.
# Sem argumentos só mostra o que mudaria; com --aplicar troca as regras UDP dentro de 49152–65535
# (a antiga era 49160–49200) por uma só, 49152–65535.
#   py deploy/oracle-portas-turn.py [--aplicar] [--ip 146.235.41.73]
import argparse
import oci

MIN_PORT, MAX_PORT = 49152, 65535

parser = argparse.ArgumentParser()
parser.add_argument('--aplicar', action='store_true')
parser.add_argument('--ip', default='146.235.41.73')
args = parser.parse_args()

cfg = oci.config.from_file()
compute = oci.core.ComputeClient(cfg)
net = oci.core.VirtualNetworkClient(cfg)
tenancy = cfg['tenancy']
compartments = [tenancy] + [c.id for c in oci.identity.IdentityClient(cfg).list_compartments(tenancy, compartment_id_in_subtree=True).data]
vnic = next((v for comp in compartments for att in compute.list_vnic_attachments(comp).data
             for v in [net.get_vnic(att.vnic_id).data] if v.public_ip == args.ip), None)
if not vnic:
    raise SystemExit(f'Nenhuma placa de rede com o IP {args.ip}.')

def turn_range(rule):
    port = rule.udp_options.destination_port_range if rule.protocol == '17' and rule.udp_options else None
    return port and rule.source == '0.0.0.0/0' and MIN_PORT <= port.min and port.max <= MAX_PORT and (port.min, port.max)

for list_id in net.get_subnet(vnic.subnet_id).data.security_list_ids:
    response = net.get_security_list(list_id)
    security_list = response.data
    turn = [r for r in security_list.ingress_security_rules if turn_range(r)]
    print(f'{security_list.display_name}: UDP do retransmissor hoje = {[turn_range(r) for r in turn] or "nenhuma"}')
    if [turn_range(r) for r in turn] == [(MIN_PORT, MAX_PORT)]:
        print('  já está liberado.')
        continue
    rules = [r for r in security_list.ingress_security_rules if not turn_range(r)]
    rules.append(oci.core.models.IngressSecurityRule(protocol='17', source='0.0.0.0/0', source_type='CIDR_BLOCK', is_stateless=False,
                                                     description='coturn: portas do retransmissor',
                                                     udp_options=oci.core.models.UdpOptions(destination_port_range=oci.core.models.PortRange(min=MIN_PORT, max=MAX_PORT))))
    if not args.aplicar:
        print(f'  mudaria para UDP {MIN_PORT}-{MAX_PORT} (rode com --aplicar).')
        continue
    net.update_security_list(list_id, oci.core.models.UpdateSecurityListDetails(ingress_security_rules=rules), if_match=response.headers['etag'])
    print(f'  liberado: UDP {MIN_PORT}-{MAX_PORT}.')
