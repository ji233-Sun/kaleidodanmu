import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'effects' })
@Index('uq_effects_slug', ['slug'], { unique: true })
@Index('idx_effects_owner', ['ownerId'])
@Index('idx_effects_square', ['visibility', 'publishedVersionId'])
export class Effect {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_effects',
  })
  id!: number

  @Column({ name: 'owner_id', type: 'integer', nullable: false })
  ownerId!: number

  @Column({ type: 'text', nullable: false })
  slug!: string

  @Column({ type: 'text', nullable: false })
  name!: string

  // 版本本身不可覆盖，发布/回滚只改这三个外键指针
  @Column({ name: 'draft_version_id', type: 'integer', nullable: true })
  draftVersionId!: number | null

  @Column({ name: 'staging_version_id', type: 'integer', nullable: true })
  stagingVersionId!: number | null

  @Column({ name: 'published_version_id', type: 'integer', nullable: true })
  publishedVersionId!: number | null

  // —— 社区 / 广场字段 ——
  @Column({ name: 'forked_from', type: 'integer', nullable: true })
  forkedFrom!: number | null

  @Column({ type: 'text', default: 'private' })
  visibility!: string // 'private' | 'public'

  @Column({ type: 'text', default: '' })
  prompt!: string

  @Column({ name: 'recipe_json', type: 'text', default: '{}' })
  recipeJson!: string

  @Column({ name: 'tags_json', type: 'text', default: '[]' })
  tagsJson!: string

  @Column({ type: 'integer', default: 0 })
  likes!: number

  @Column({ type: 'integer', default: 0 })
  uses!: number

  @Column({ type: 'integer', default: 0 })
  remixes!: number

  @Column({ type: 'integer', default: 0 })
  coins!: number

  @Column({ type: 'integer', default: 0 })
  favorites!: number

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date

  @Column({
    name: 'updated_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date
}
