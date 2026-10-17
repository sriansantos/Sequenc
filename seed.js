// Grupos em ordem de exibição
const GROUPS = ['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços', 'Abdômen', 'Outros'];

// Lista básica de exercícios comuns (usada para popular o banco na primeira execução)
const SEED_EXERCISES = [
  { name: 'Supino reto com barra', group: 'Peito' },
  { name: 'Supino inclinado com halteres', group: 'Peito' },
  { name: 'Crucifixo na máquina', group: 'Peito' },
  { name: 'Crossover', group: 'Peito' },
  { name: 'Paralelas', group: 'Peito' },
  { name: 'Barra fixa', group: 'Costas' },
  { name: 'Puxada frontal na polia', group: 'Costas' },
  { name: 'Remada curvada com barra', group: 'Costas' },
  { name: 'Remada unilateral com halter', group: 'Costas' },
  { name: 'Remada baixa', group: 'Costas' },
  { name: 'Agachamento livre', group: 'Pernas' },
  { name: 'Leg press 45°', group: 'Pernas' },
  { name: 'Cadeira extensora', group: 'Pernas' },
  { name: 'Mesa flexora', group: 'Pernas' },
  { name: 'Panturrilha em pé', group: 'Pernas' },
  { name: 'Panturrilha sentado', group: 'Pernas' },
  { name: 'Afundo com halteres', group: 'Pernas' },
  { name: 'Stiff com barra', group: 'Pernas' },
  { name: 'Desenvolvimento com halteres', group: 'Ombros' },
  { name: 'Desenvolvimento na máquina', group: 'Ombros' },
  { name: 'Elevação lateral', group: 'Ombros' },
  { name: 'Elevação frontal', group: 'Ombros' },
  { name: 'Encolhimento com halteres', group: 'Ombros' },
  { name: 'Rosca direta com barra', group: 'Braços' },
  { name: 'Rosca alternada', group: 'Braços' },
  { name: 'Rosca martelo', group: 'Braços' },
  { name: 'Rosca scott', group: 'Braços' },
  { name: 'Tríceps testa', group: 'Braços' },
  { name: 'Tríceps na polia (corda)', group: 'Braços' },
  { name: 'Tríceps francês', group: 'Braços' },
  { name: 'Abdominal supra', group: 'Abdômen' },
  { name: 'Abdominal na máquina', group: 'Abdômen' },
  { name: 'Prancha isométrica', group: 'Abdômen' },
  { name: 'Elevação de pernas', group: 'Abdômen' },
];

module.exports = { GROUPS, SEED_EXERCISES };
