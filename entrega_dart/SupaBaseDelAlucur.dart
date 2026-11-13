import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const App());
}

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Lista de Matrículas',
      theme: ThemeData.dark(),
      home: const Tela(),
    );
  }
}

class Tela extends StatefulWidget {
  const Tela({super.key});

  @override
  State<Tela> createState() => _TelaState();
}

class _TelaState extends State<Tela> {
  final String supabaseUrl = 'https://pkgtycruontbtrewsbrb.supabase.co';
  final String apikey = 'sb_publishable_RPXnyirzIe0cqDLjHzv1eA_6C_bJcYV';

  List<dynamic> itens = [];
  bool carregando = true;
  String erro = '';

  @override
  void initState() {
    super.initState();
    buscar();
  }

  Future<void> buscar() async {
    setState(() {
      carregando = true;
      erro = '';
    });
    try {
      final resposta = await http.get(
        Uri.parse('$supabaseUrl/rest/v1/alucur?select=*&order=mat.asc'),
        headers: {'apikey': apikey, 'Authorization': 'Bearer $apikey'},
      );
      if (resposta.statusCode == 200) {
        setState(() {
          itens = jsonDecode(resposta.body);
          carregando = false;
        });
      } else {
        setState(() {
          erro = 'Erro na busca: ${resposta.statusCode}';
          carregando = false;
        });
      }
    } catch (e) {
      setState(() {
        erro = 'Falha de conexão.';
        carregando = false;
      });
    }
  }

  Future<void> excluir(int mat, int cod) async {
    Navigator.of(context).pop();
    setState(() => carregando = true);
    try {
      final resposta = await http.delete(
        Uri.parse('$supabaseUrl/rest/v1/alucur?mat=eq.$mat&cod=eq.$cod'),
        headers: {'apikey': apikey, 'Authorization': 'Bearer $apikey'},
      );
      if (resposta.statusCode == 204 || resposta.statusCode == 200) {
        mensagem('Matrícula excluída com sucesso!', Colors.green);
        buscar();
      } else {
        setState(() => carregando = false);
        mensagem('Erro ao excluir: ${resposta.body}', Colors.red);
      }
    } catch (e) {
      setState(() => carregando = false);
      mensagem('Erro de conexão: $e', Colors.red);
    }
  }

  void mensagem(String texto, Color cor) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(texto), backgroundColor: cor),
    );
  }

  void confirmar(int mat, int cod) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Confirmar Exclusão'),
          content: Text('Excluir a matrícula?\n\nAluno: $mat\nCurso: $cod'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('CANCELAR'),
            ),
            ElevatedButton(
              onPressed: () => excluir(mat, cod),
              child: const Text('EXCLUIR'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Alunos por Curso'),
        centerTitle: true,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: buscar),
        ],
      ),
      body: corpo(),
    );
  }

  Widget corpo() {
    if (carregando) {
      return const Center(child: CircularProgressIndicator());
    }
    if (erro.isNotEmpty) {
      return Center(child: Text(erro));
    }
    if (itens.isEmpty) {
      return const Center(child: Text('Nenhuma matrícula cadastrada.'));
    }
    return ListView.builder(
      itemCount: itens.length,
      itemBuilder: (context, i) {
        final item = itens[i];
        return ListTile(
          title: Text('Aluno: ${item['mat']}'),
          subtitle: Text('Curso: ${item['cod']}'),
          trailing: IconButton(
            icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
            onPressed: () => confirmar(item['mat'], item['cod']),
          ),
        );
      },
    );
  }
}
