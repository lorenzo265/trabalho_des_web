import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
      title: 'Matricular Aluno em Curso',
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

  final TextEditingController c1 = TextEditingController();
  final TextEditingController c2 = TextEditingController();
  bool carregando = false;

  Future<void> salvar() async {
    if (c1.text.isEmpty || c2.text.isEmpty) {
      mensagem('Preencha todos os campos!', Colors.orange);
      return;
    }
    setState(() => carregando = true);
    try {
      final resposta = await http.post(
        Uri.parse('$supabaseUrl/rest/v1/alucur'),
        headers: {
          'apikey': apikey,
          'Authorization': 'Bearer $apikey',
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: jsonEncode({'mat': int.parse(c1.text), 'cod': int.parse(c2.text)}),
      );
      if (resposta.statusCode == 201) {
        mensagem('Aluno matriculado com sucesso!', Colors.green);
        c1.clear();
        c2.clear();
      } else {
        mensagem('Erro ao cadastrar: ${resposta.body}', Colors.red);
      }
    } catch (e) {
      mensagem('Erro de conexão: $e', Colors.red);
    } finally {
      setState(() => carregando = false);
    }
  }

  void mensagem(String texto, Color cor) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(texto), backgroundColor: cor),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Matricular Aluno em Curso'), centerTitle: true),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            TextField(
              controller: c1,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                labelText: 'Matrícula do aluno',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 15),
            TextField(
              controller: c2,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                labelText: 'Código do curso',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 30),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: carregando ? null : salvar,
                child: carregando
                    ? const CircularProgressIndicator()
                    : const Text('CADASTRAR'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
